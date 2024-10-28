import { setTriggerPriceCommand } from '@/commands/set-trigger-price';
import { Config } from '@/utils/config';
import DatabaseClient from '@/utils/db';
import { _SdkManager } from '@/utils/sdk-manager';
import { sendToSequencer } from '@/utils/sequencer';
import { Wallet } from '@/utils/wallet';
import { test } from '@fixtures/baseFixture';
import { AsyncCreateOrderParams, Direction } from '@storm-trade/sdk';
import { beginCell, external, internal, storeMessage } from '@ton/core';
import { Client } from 'pg';
import { expect } from 'playwright/test';

// We can't run in parallel because of the seqno can't transfer from the same wallet in parallel

await Config.init();

/**
 * @description
 * Loops until `endTime` is reached or `orderStatuses` sequence is found in `orderHistory`.
 * It waits for 1 second in each iteration.
 * It filters out all `tx_sent` records except the last one.
 * It returns the last `orderHistory` and two sets: `actualOrderStatuses` and `orderTypesSet`.
 * @param {DatabaseClient<Client>} db - an instance of DatabaseClient
 * @param {string} traderRawString - raw string representation of the trader's address
 * @param {string[]} orderStatuses - an array of order statuses in the order they should appear in `orderHistory`
 * @param {number} [endTime=Date.now() + 10 * 60 * 1000] - a timestamp in milliseconds when the loop should stop
 * @returns {Promise<{ orderHistory: any[]; actualOrderStatuses: string[]; orderTypesSet: Set<string> }>}
 */
async function getOrderHistoryLoop(
  db: DatabaseClient<Client>,
  traderRawString: string,
  orderStatuses: string[],
  endTime: number = Date.now() + 5 * 60 * 1000
) {
  let orderHistory: any[] = [];
  let actualOrderStatuses: string[] = [];
  let orderTypesSet: Set<string> = new Set();
  while (Date.now() < endTime) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    orderHistory = await db.getOrderHistory(traderRawString);
    while (orderHistory.filter(({ status }) => status === 'tx_sent').length > 1) {
      const firstTxSentRecord = orderHistory.find(({ status }) => status === 'tx_sent');
      const index = orderHistory.indexOf(firstTxSentRecord);
      orderHistory.splice(index, 1);
    }
    actualOrderStatuses = orderHistory.map(({ status }) => status);
    orderTypesSet = new Set(orderHistory.map(({ type }) => type));
    if (orderStatuses.every((status, index) => status === actualOrderStatuses[index])) {
      break;
    }
  }
  return {
    orderHistory,
    actualOrderStatuses,
    orderTypesSet,
  };
}

/**
 * Checks that the time spent from the active status to the executed status is less than the given maximum.
 * @param orderExecuted - The executed order
 * @param orderActive - The active order
 * @param executionTime - The maximum time in ms. Default is 60s
 */
const checkOrderExecutionTime = (orderExecuted: any, orderActive: any, executionTime: number = 60 * 1000) => {
  const executedTs = new Date(orderExecuted?.event_created_at).getTime();
  const activeTs = new Date(orderActive?.event_created_at).getTime();
  expect(executedTs - activeTs, `Checking that time spent from active status to executed is less than ${executionTime}ms`).toBeLessThanOrEqual(
    executionTime
  );
};

// const testCases = [
//   // Default limit order
//   {
//     orderType: 'stopLimit' as const,
//     direction: Direction['short'],
//     leverage: BigInt(50 * 1e9),
//     amount: Config.toAsset(quoteAssetName, 1),
//     baseAsset,
//     expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
//     stopTriggerPrice: Config.toAsset(quoteAssetName, 99.5),
//     takeTriggerPrice: 0n,
//     stopPrice: 0n,
//     limitPrice: Config.toAsset(quoteAssetName, 100),
//   },
//   // stopLimit order type
//   {
//     orderType: 'stopLimit' as const,
//     direction: Direction['short'],
//     leverage: BigInt(50 * 1e9),
//     amount: Config.toAsset(quoteAssetName, 1),
//     baseAsset,
//     expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
//     stopTriggerPrice: Config.toAsset(quoteAssetName, 99.5),
//     takeTriggerPrice: 0n,
//     stopPrice: 100n,
//     limitPrice: Config.toAsset(quoteAssetName, 100),
//   },
// ];

const EXECUTED_ORDER_STATUSES = ['seq_pending', 'active', 'tx_sent', 'executed'];
const ACTIVE_ORDER_STATUSES = ['seq_pending', 'active'];

['BTC/USDT', 'ETH/USDT', 'BNB/USDT'].forEach((market) => {
  test(`Verify that order open market order can be created in ${market}`, async ({ wallet, sdkManager, db, tonAddress, tonAddressRaw }) => {
    const { vaultAddress, quoteAssetId, baseAsset } = Config.getMarket(market);
    const quoteAssetName = Config.assetIdToName(quoteAssetId);
    const AMOUNT_OF_USDT = 1;
    // default market order
    const orderType = 'market' as const;
    const orderParams = {
      orderType,
      direction: Direction['long'],
      leverage: BigInt(50 * 1e9),
      amount: Config.toAsset(quoteAssetName, AMOUNT_OF_USDT),
      baseAsset,
      expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
      stopTriggerPrice: 0n,
      takeTriggerPrice: 0n,
      limitPrice: 0n,
      traderAddress: tonAddress,
    };
    await createOrder(sdkManager, vaultAddress, orderParams, wallet);
    let { orderHistory, actualOrderStatuses, orderTypesSet } = await getOrderHistoryLoop(db, tonAddressRaw, EXECUTED_ORDER_STATUSES);
    checkOrderStatuses(actualOrderStatuses, EXECUTED_ORDER_STATUSES);
    checkOrderType(orderTypesSet, orderType);
    const orderExecuted = findOrderByStatus(orderHistory, 'executed');
    const orderActive = findOrderByStatus(orderHistory, 'active');
    checkOrderExecutionTime(orderExecuted, orderActive);
    const [traderPosition] = await db.getTraderPositions(tonAddressRaw);
    checkIndexPriceAndPositionStatus(traderPosition);
  });
});

test(`Verify that stop market order can be created and activated via index price == stop price`, async ({
  wallet,
  sdkManager,
  db,
  tonAddress,
  tonAddressRaw,
}) => {
  const { vaultAddress, quoteAssetId, baseAsset } = Config.getMarket('BNB/USDT');
  const quoteAssetName = Config.assetIdToName(quoteAssetId);
  const stopPrice = BigInt(101 * 1e9);
  const orderParams = {
    orderType: 'stopLimit' as const,
    direction: Direction['long'],
    leverage: BigInt(50 * 1e9),
    amount: Config.toAsset(quoteAssetName, 1),
    baseAsset,
    expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
    stopTriggerPrice: 0n,
    takeTriggerPrice: 0n,
    limitPrice: 0n,
    stopPrice,
    traderAddress: tonAddress,
  };
  await setTriggerPriceCommand(baseAsset, 100);
  await createOrder(sdkManager, vaultAddress, orderParams, wallet);
  const orderType = 'limit';
  let { orderHistory, actualOrderStatuses, orderTypesSet } = await getOrderHistoryLoop(db, tonAddressRaw, ACTIVE_ORDER_STATUSES);
  orderHistory.forEach(({ stop_price }) => {
    expect(Number(stop_price), 'Checking stop price. Should be equal to the one set in initial orderParams').toEqual(Number(stopPrice));
  });
  checkOrderStatuses(actualOrderStatuses, ACTIVE_ORDER_STATUSES);
  checkOrderType(orderTypesSet, orderType);
  await setTriggerPriceCommand(baseAsset, Number(stopPrice) / 1e9);
  const {
    orderHistory: secondRecordHistory,
    actualOrderStatuses: secondActualOrderStatuses,
    orderTypesSet: secondOrderTypesSet,
  } = await getOrderHistoryLoop(db, tonAddressRaw, EXECUTED_ORDER_STATUSES);
  let executedOrderRecord = findOrderByStatus(secondRecordHistory, 'executed');
  let activeOrderRecord = findOrderByStatus(secondRecordHistory, 'active');
  checkOrderExecutionTime(executedOrderRecord, activeOrderRecord);
  checkOrderStatuses(secondActualOrderStatuses, EXECUTED_ORDER_STATUSES);
  checkOrderType(secondOrderTypesSet, orderType);
  const [traderPosition] = await db.getTraderPositions(tonAddressRaw);
  checkIndexPriceAndPositionStatus(traderPosition);
});

async function createOrder(sdkManager: _SdkManager, vaultAddress: string, orderParams: AsyncCreateOrderParams, wallet: Wallet) {
  const transaction = await sdkManager.createOrder(vaultAddress, orderParams);
  const seqno = await wallet.getSeqno();
  const transfer = await wallet.createTransfer([internal(transaction)], seqno);
  const ext = beginCell()
    .store(storeMessage(external({ body: transfer, to: wallet.getTonAddress() })))
    .endCell();
  await sendToSequencer(ext);
  await wallet.waitSeqno(seqno);
}

function checkIndexPriceAndPositionStatus(traderPosition: Record<string, any>, PRICE_IMPACT_COEFFICIENT = 0.02) {
  // for non default market orders we should check by trigger price instead of index price + coefficient should be very small
  expect(traderPosition.status, 'Checking trader position status to be opened').toEqual('opened');
  const indexPrice = Number(traderPosition?.index_price);
  const exchangedQuote = Number(traderPosition?.exchanged_quote);
  const exchangedBase = Number(traderPosition?.exchanged_base);
  const priceImpact = (exchangedQuote / exchangedBase) * PRICE_IMPACT_COEFFICIENT;
  const lowerBound = indexPrice - priceImpact;
  const upperBound = indexPrice + priceImpact;
  expect(indexPrice, 'Checking lower boundary of trader position index price').toBeGreaterThanOrEqual(lowerBound);
  expect(indexPrice, 'Checking upper boundary of trader position index price').toBeLessThanOrEqual(upperBound);
}

function checkOrderStatuses(actualOrderStatuses: string[], expectedOrderStatuses: string[]) {
  expect(actualOrderStatuses, `Checking order statuses. Expecting to have - ${expectedOrderStatuses.join(', ')}`).toEqual(expectedOrderStatuses);
}

function checkOrderType(actualOrderTypes: Set<string>, orderType: string) {
  expect(actualOrderTypes, `Checking order types. Expecting to have orderType - ${orderType}`).toEqual(new Set([orderType]));
}

function findOrderByStatus(orderHistory: any[], status: string) {
  return orderHistory.find(({ status: orderStatus }) => orderStatus === status);
}
