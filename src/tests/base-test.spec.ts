import { setTriggerPriceCommand } from '@/commands/set-trigger-price';
import { Config } from '@/utils/config';
import DatabaseClient from '@/utils/db';
import { _SdkManager } from '@/utils/sdk-manager';
import { sendToSequencer } from '@/utils/sequencer';
import { test } from '@fixtures/baseFixture';
import { Direction } from '@storm-trade/sdk';
import { beginCell, external, internal, storeMessage } from '@ton/core';
import { Client } from 'pg';
import { expect } from 'playwright/test';

// We can't run in parallel because of the seqno can't transfer from the same wallet in parallel

await Config.init();

async function getOrderHistoryLoop(
  db: DatabaseClient<Client>,
  traderRawString: string,
  orderStatuses: string[],
  endTime: number = Date.now() + 10 * 60 * 1000
) {
  let orderHistory: any[] = [];
  let actualOrderStatuses: string[] = [];
  let orderTypesSet: Set<string> = new Set();
  while (Date.now() < endTime) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    orderHistory = await db.getOrderHistory(traderRawString);
    const allTxSentRecords = orderHistory.filter(({ status }) => status === 'tx_sent');
    if (allTxSentRecords.length > 1) {
      const [firstTxSentRecord] = allTxSentRecords;
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

// create separate test where market first would be opened and then separate transaction to create takeProfit position and StopLoss position in the same direction
test(`Verify that order open market order can be created`, async ({ wallet, sdkManager, db }) => {
  const traderAddress = wallet.getTonAddress();
  const MARKET = Config.getMarket('BNB/USDT');
  const { vaultAddress, quoteAssetId, baseAsset } = MARKET;
  const quoteAssetName = Config.assetIdToName(quoteAssetId);
  // default market order
  const orderParams = {
    orderType: 'market' as const,
    direction: Direction['long'],
    leverage: BigInt(50 * 1e9),
    amount: Config.toAsset(quoteAssetName, 1),
    baseAsset,
    expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
    stopTriggerPrice: 0n,
    takeTriggerPrice: 0n,
    limitPrice: 0n,
  };
  const transaction = await sdkManager.createOrder(vaultAddress, { ...orderParams, traderAddress });
  const seqno = await wallet.getSeqno();
  const transfer = await wallet.createTransfer([internal(transaction)], seqno);
  const ext = beginCell()
    .store(storeMessage(external({ body: transfer, to: wallet.getTonAddress() })))
    .endCell();
  await sendToSequencer(ext);
  await wallet.waitSeqno(seqno);
  const traderRawString = traderAddress.toRawString();
  const orderStatuses = ['seq_pending', 'active', 'tx_sent', 'executed'];
  const orderType = 'market';
  // check order statuses in order history after 5 min interval (pending to executed (all statuses) )
  let { orderHistory, actualOrderStatuses, orderTypesSet } = await getOrderHistoryLoop(db, traderRawString, orderStatuses);
  expect(actualOrderStatuses).toEqual(orderStatuses);
  expect(orderTypesSet).toEqual(new Set([orderType]));
  // check that event_created of active orderType and executed not more than 1 min (soft assertion)
  if (orderHistory !== undefined) {
    const orderExecuted = orderHistory.find(({ status }) => status === 'executed');
    const orderActive = orderHistory.find(({ status }) => status === 'active');
    const executedTs = new Date(orderExecuted?.event_created_at).getTime();
    const activeTs = new Date(orderActive?.event_created_at).getTime();
    expect(executedTs - activeTs).toBeLessThanOrEqual(60 * 1000);
  }
  const [traderPosition] = await db.getTraderPositions(traderRawString);
  expect(traderPosition.status).toEqual('opened');
  const PRICE_IMPACT_COEFFICIENT = 0.02;
  const lowerBoundary = traderPosition.index_price - (traderPosition.exchange_qoute / traderPosition.exchange_base) * PRICE_IMPACT_COEFFICIENT; //
  const upperBoundary = traderPosition.index_price + (traderPosition.exchange_qoute / traderPosition.exchange_base) * PRICE_IMPACT_COEFFICIENT; //
  expect(Number(traderPosition.index_price)).toBeGreaterThanOrEqual(lowerBoundary);
  expect(Number(traderPosition.index_price)).toBeLessThanOrEqual(upperBoundary);
});

test(`Verify that stop market order can be created and activated via fake oracle price equal to stop limit price`, async ({
  wallet,
  sdkManager,
  db,
}) => {
  const traderAddress = wallet.getTonAddress();
  // stop market order
  const MARKET = Config.getMarket('BNB/USDT');
  const { vaultAddress, quoteAssetId, baseAsset } = MARKET;
  const quoteAssetName = Config.assetIdToName(quoteAssetId);
  const orderParams = {
    orderType: 'market' as const,
    direction: Direction['long'],
    leverage: BigInt(50 * 1e9),
    amount: Config.toAsset(quoteAssetName, 1),
    baseAsset,
    expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
    stopTriggerPrice: 0n,
    takeTriggerPrice: 0n,
    limitPrice: 0n,
    stopPrice: BigInt(1.1 * 1e9),
  };
  const transaction = await sdkManager.createOrder(vaultAddress, { ...orderParams, traderAddress });
  const seqno = await wallet.getSeqno();
  const transfer = await wallet.createTransfer([internal(transaction)], seqno);
  const ext = beginCell()
    .store(storeMessage(external({ body: transfer, to: wallet.getTonAddress() })))
    .endCell();
  await sendToSequencer(ext);
  await wallet.waitSeqno(seqno);
  const traderRawString = traderAddress.toRawString();
  let orderStatuses = ['seq_pending', 'active'];
  const orderType = 'limit';
  // check order statuses in order history after 5 min interval (pending to executed (all statuses) )
  let { orderHistory, actualOrderStatuses, orderTypesSet } = await getOrderHistoryLoop(db, traderRawString, orderStatuses);
  expect(actualOrderStatuses).toEqual(orderStatuses);
  expect(orderTypesSet).toEqual(new Set([orderType]));
  orderStatuses = ['seq_pending', 'active', 'tx_sent', 'executed'];
  await setTriggerPriceCommand(baseAsset, 1.1);
  const orderHistoryLoopResponse = await getOrderHistoryLoop(db, traderRawString, orderStatuses);
  expect(orderHistoryLoopResponse.actualOrderStatuses).toEqual(orderStatuses);
  expect(orderHistoryLoopResponse.orderTypesSet).toEqual(new Set([orderType]));
  const [traderPosition] = await db.getTraderPositions(traderRawString);
  expect(traderPosition.status).toEqual('opened');
  // for non default market orders we should check by trigger price instead of index price + coefficient should be very small
  const PRICE_IMPACT_COEFFICIENT = 0.02;
  const lowerBoundary = traderPosition.index_price - (traderPosition.exchange_qoute / traderPosition.exchange_base) * PRICE_IMPACT_COEFFICIENT; //
  const upperBoundary = traderPosition.index_price + (traderPosition.exchange_qoute / traderPosition.exchange_base) * PRICE_IMPACT_COEFFICIENT; //
  expect(Number(traderPosition.index_price)).toBeGreaterThanOrEqual(lowerBoundary);
  expect(Number(traderPosition.index_price)).toBeLessThanOrEqual(upperBoundary);
  /* trader position / order v2 table in db (checking index price + exchange_qoute / exchange_base compare it to index_price)
    with price impact coefficient derivation (0.02% for example) */
  console.log('trader address', traderRawString);
  console.log('orders', orderHistory);
});
