import { setTriggerPriceCommand } from '@/commands/set-trigger-price';
import { Config } from '@/utils/config';
import DatabaseClient from '@/utils/db';
import { getLastPrice } from '@/utils/oracle';
import { _SdkManager } from '@/utils/sdk-manager';
import { sendToSequencer } from '@/utils/sequencer';
import { Wallet } from '@/utils/wallet';
import { test } from '@fixtures/baseFixture';
import { AsyncCreateOrderParams, Direction, TXParams } from '@storm-trade/sdk';
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
  orderType: string = 'market',
  endTime: number = Date.now() + 5 * 60 * 1000
) {
  let orderHistory: any[] = [];
  let actualOrderStatuses: string[] = [];
  let orderTypesSet: Set<string> = new Set();
  while (Date.now() < endTime) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    orderHistory = await db.getOrderHistory(traderRawString, orderType);
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
 * Loops until `endTime` is reached or a trader position is found in `closedAt` status.
 * It waits for 1 second in each iteration.
 * It returns the last `traderPosition` and its `closedAt` timestamp.
 * @param {DatabaseClient<Client>} db - an instance of DatabaseClient
 * @param {string} traderRawString - raw string representation of the trader's address
 * @param {number} [endTime=Date.now() + 10 * 60 * 1000] - a timestamp in milliseconds when the loop should stop
 * @returns {Promise<{ traderPosition: any; closedAt: number | null }>}
 */
async function verifyThatPositionIsClosed(db: DatabaseClient<Client>, traderRawString: string, endTime: number = Date.now() + 5 * 60 * 1000) {
  let traderPosition: any = {};
  while (Date.now() < endTime) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    traderPosition = (await db.getTraderPositions(traderRawString)).find(({ status }) => status === 'closed');
    if (traderPosition?.tx_id) {
      break;
    }
  }
  expect.soft(traderPosition?.status, 'Checking that trader position is closed').toBe('closed');
  return {
    traderPosition,
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
  expect
    .soft(executedTs - activeTs, `Checking that time spent from active status to executed is less than ${executionTime}ms`)
    .toBeLessThanOrEqual(executionTime);
};

const EXECUTED_ORDER_STATUSES = ['seq_pending', 'active', 'tx_sent', 'executed'];
const ACTIVE_ORDER_STATUSES = ['seq_pending', 'active'];

['BTC/USDT', 'ETH/USDT', 'DOGE/USDT'].forEach((market) => {
  test(`Verify that order open market order can be created in ${market}`, async ({ wallet, sdkManager, db, tonAddress, tonAddressRaw }) => {
    test.setTimeout(1000 * 8 * 60);
    const { vaultAddress, quoteAssetId, baseAsset } = Config.getMarket(market);
    const quoteAssetName = Config.assetIdToName(quoteAssetId);
    const AMOUNT_OF_USDT = 1;
    const AMOUNT_IN_ASSET = Config.toAsset(quoteAssetName, AMOUNT_OF_USDT);
    // default market order
    const orderType = 'market' as const;
    const orderParams = {
      orderType,
      direction: Direction['long'],
      leverage: BigInt(50 * 1e9),
      amount: AMOUNT_IN_ASSET,
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
    await closePosition(
      sdkManager,
      vaultAddress,
      { traderAddress: tonAddress, baseAsset, direction: Direction['long'], amount: traderPosition.size },
      wallet
    );
    await verifyThatPositionIsClosed(db, tonAddressRaw);
  });
});

const limitTriggerPrices = [
  { price: 4.12, description: 'oracle price far from liquidation price' },
  { price: 4.3, description: 'oracle price close to liquidation price' },
];
limitTriggerPrices.forEach(({ price, description }) => {
  test(
    `Execution of SHORT order limit before liquidation price ${description}`,
    { tag: '@IN-DEV' },
    async ({ wallet, sdkManager, db, tonAddress, tonAddressRaw, treasury }) => {
      test.setTimeout(1000 * 8 * 60);
      1234;
      const { vaultAddress, quoteAssetId, baseAsset } = Config.getMarket('BNB/USDT');
      const quoteAssetName = Config.assetIdToName(quoteAssetId);
      const AMOUNT_OF_USDT = 1;
      const AMOUNT_IN_ASSET = Config.toAsset(quoteAssetName, AMOUNT_OF_USDT);
      const marketOrderType = 'market' as const;
      const LIMIT_PRICE = BigInt(Math.floor(4.1 * 1e9));
      await setTriggerPriceCommand(baseAsset, 3.9);
      const limitOrderType = 'limit';
      const direction = Direction['short'];
      const orderParams = {
        orderType: marketOrderType,
        direction: direction,
        leverage: BigInt(10 * 1e9),
        amount: AMOUNT_IN_ASSET,
        baseAsset,
        expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
        stopTriggerPrice: 0n,
        takeTriggerPrice: 0n,
        limitPrice: 0n,
        traderAddress: tonAddress,
      };
      const limitOrderParams = {
        orderType: 'stopLimit' as const,
        direction: direction,
        leverage: BigInt(10 * 1e9),
        amount: AMOUNT_IN_ASSET,
        baseAsset,
        expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
        stopTriggerPrice: 0n,
        takeTriggerPrice: 0n,
        stopPrice: 0n,
        traderAddress: tonAddress,
        limitPrice: LIMIT_PRICE,
      };
      await treasury.transfer('USDT', tonAddress, AMOUNT_OF_USDT + 0.05);
      await createOrder(sdkManager, vaultAddress, orderParams, wallet);
      let { orderHistory, actualOrderStatuses, orderTypesSet } = await getOrderHistoryLoop(db, tonAddressRaw, EXECUTED_ORDER_STATUSES);
      checkOrderStatuses(actualOrderStatuses, EXECUTED_ORDER_STATUSES);
      checkOrderType(orderTypesSet, marketOrderType);
      const orderExecuted = findOrderByStatus(orderHistory, 'executed');
      const orderActive = findOrderByStatus(orderHistory, 'active');
      checkOrderExecutionTime(orderExecuted, orderActive);
      const [traderPosition] = await db.getTraderPositions(tonAddressRaw);
      checkIndexPriceAndPositionStatus(traderPosition);
      await createOrder(sdkManager, vaultAddress, limitOrderParams, wallet);
      let { actualOrderStatuses: limitOrderStatuses, orderTypesSet: limitOrderTypesSet } = await getOrderHistoryLoop(
        db,
        tonAddressRaw,
        ACTIVE_ORDER_STATUSES,
        limitOrderType
      );
      checkOrderStatuses(limitOrderStatuses, ACTIVE_ORDER_STATUSES);
      checkOrderType(limitOrderTypesSet, limitOrderType);
      await setTriggerPriceCommand(baseAsset, price);
      let {
        orderHistory: limitOrderHistory,
        actualOrderStatuses: executedLimitOrderStatuses,
        orderTypesSet: executedLimitOrderTypesSet,
      } = await getOrderHistoryLoop(db, tonAddressRaw, EXECUTED_ORDER_STATUSES, limitOrderType);
      checkOrderStatuses(executedLimitOrderStatuses, EXECUTED_ORDER_STATUSES);
      checkOrderType(executedLimitOrderTypesSet, limitOrderType);
      const limitOrderExecuted = findOrderByStatus(limitOrderHistory, 'executed');
      const limitOrderActive = findOrderByStatus(limitOrderHistory, 'active');
      checkOrderExecutionTime(limitOrderExecuted, limitOrderActive);
      const secondTraderPositionResponse = await db.getTraderPositions(tonAddressRaw);
      const MARGIN_CHANGE_COEFFICIENT = 0.01;
      const traderPositionV1 = secondTraderPositionResponse.find(({ version }) => Number(version) === 1);
      if (!traderPositionV1) {
        throw new Error('Trader position v1 is not found');
      }
      checkIndexPriceAndPositionStatus(traderPositionV1, 0.03);
      const TOTAL_SPENT_IN_USDT = AMOUNT_OF_USDT * 2 * 1e9;
      const TOTAL_SPENT_MINUS_FEES = TOTAL_SPENT_IN_USDT - Number(traderPositionV1?.fee);
      const TOTAL_SPENT_WITH_FEES_MINUS_SETTLEMENT_ORACLE_PRICE = TOTAL_SPENT_MINUS_FEES / Number(traderPositionV1?.settlement_oracle_price);
      const CALCULATED_SPENDINGS = TOTAL_SPENT_WITH_FEES_MINUS_SETTLEMENT_ORACLE_PRICE * MARGIN_CHANGE_COEFFICIENT;
      const traderPositionMargin = Number(traderPositionV1?.margin) / 1e9;
      expect
        .soft(traderPositionMargin, 'Margin change after creation of limit order to existing market order, more than boundary')
        .toBeGreaterThan(TOTAL_SPENT_WITH_FEES_MINUS_SETTLEMENT_ORACLE_PRICE - CALCULATED_SPENDINGS);
      expect
        .soft(traderPositionMargin, 'Margin change after creation of limit order to existing market order, less than boundary')
        .toBeLessThan(TOTAL_SPENT_WITH_FEES_MINUS_SETTLEMENT_ORACLE_PRICE + CALCULATED_SPENDINGS);
      await closePosition(
        sdkManager,
        vaultAddress,
        { traderAddress: tonAddress, baseAsset, direction: direction, amount: BigInt(Math.abs(traderPositionV1.size)) },
        wallet
      );
      await verifyThatPositionIsClosed(db, tonAddressRaw);
    }
  );
});

test(`Stop market order on synthetic BNB/USDT with fake oracle price changes`, async ({ wallet, sdkManager, db, tonAddress, tonAddressRaw }) => {
  test.setTimeout(60 * 12 * 1000);
  const { vaultAddress, quoteAssetId, baseAsset } = Config.getMarket('BNB/USDT');
  const quoteAssetName = Config.assetIdToName(quoteAssetId);
  const AMOUNT_OF_USDT = 1;
  const AMOUNT_IN_ASSET = Config.toAsset(quoteAssetName, AMOUNT_OF_USDT);
  const stopPrice = BigInt(4 * 1e9);
  const orderParams = {
    orderType: 'stopLimit' as const,
    direction: Direction['long'],
    leverage: BigInt(50 * 1e9),
    amount: AMOUNT_IN_ASSET,
    baseAsset,
    expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
    stopTriggerPrice: 0n,
    takeTriggerPrice: 0n,
    limitPrice: 0n,
    stopPrice,
    traderAddress: tonAddress,
  };
  await setTriggerPriceCommand(baseAsset, 3);
  await createOrder(sdkManager, vaultAddress, orderParams, wallet);
  const orderType = 'limit';
  let { orderHistory, actualOrderStatuses, orderTypesSet } = await getOrderHistoryLoop(db, tonAddressRaw, ACTIVE_ORDER_STATUSES, orderType);
  orderHistory.forEach(({ stop_price }) => {
    expect.soft(Number(stop_price), 'Checking stop price. Should be equal to the one set in initial orderParams').toEqual(Number(stopPrice));
  });
  checkOrderStatuses(actualOrderStatuses, ACTIVE_ORDER_STATUSES);
  checkOrderType(orderTypesSet, orderType);
  await setTriggerPriceCommand(baseAsset, Number(stopPrice) / 1e9);
  const {
    orderHistory: secondRecordHistory,
    actualOrderStatuses: secondActualOrderStatuses,
    orderTypesSet: secondOrderTypesSet,
  } = await getOrderHistoryLoop(db, tonAddressRaw, EXECUTED_ORDER_STATUSES, orderType);
  let executedOrderRecord = findOrderByStatus(secondRecordHistory, 'executed');
  let activeOrderRecord = findOrderByStatus(secondRecordHistory, 'active');
  checkOrderExecutionTime(executedOrderRecord, activeOrderRecord);
  checkOrderStatuses(secondActualOrderStatuses, EXECUTED_ORDER_STATUSES);
  checkOrderType(secondOrderTypesSet, orderType);
  const [traderPosition] = await db.getTraderPositions(tonAddressRaw);
  checkIndexPriceAndPositionStatus(traderPosition);
  await closePosition(
    sdkManager,
    vaultAddress,
    { traderAddress: tonAddress, baseAsset, direction: Direction['long'], amount: traderPosition.size },
    wallet
  );
  await verifyThatPositionIsClosed(db, tonAddressRaw);
});

test(`Stop market order on BTC/USDT with real oracle price`, async ({ wallet, sdkManager, db, tonAddress, tonAddressRaw }) => {
  test.setTimeout(60 * 12 * 1000);
  const { vaultAddress, quoteAssetId, baseAsset } = Config.getMarket('BTC/USDT');
  const quoteAssetName = Config.assetIdToName(quoteAssetId);
  const AMOUNT_OF_USDT = 1;
  const AMOUNT_IN_ASSET = Config.toAsset(quoteAssetName, AMOUNT_OF_USDT);
  const currentPrice = await getLastPrice(baseAsset);
  const stopPrice = BigInt(Math.floor(currentPrice * 1.00001));
  const orderParams = {
    orderType: 'stopLimit' as const,
    direction: Direction['long'],
    leverage: BigInt(50 * 1e9),
    amount: AMOUNT_IN_ASSET,
    baseAsset,
    expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
    stopTriggerPrice: 0n,
    takeTriggerPrice: 0n,
    limitPrice: 0n,
    stopPrice,
    traderAddress: tonAddress,
  };
  await createOrder(sdkManager, vaultAddress, orderParams, wallet);
  const orderType = 'limit';
  let { orderHistory, actualOrderStatuses, orderTypesSet } = await getOrderHistoryLoop(db, tonAddressRaw, ACTIVE_ORDER_STATUSES);
  orderHistory.forEach(({ stop_price }) => {
    expect.soft(Number(stop_price), 'Checking stop price. Should be equal to the one set in initial orderParams').toEqual(Number(stopPrice));
  });
  checkOrderStatuses(actualOrderStatuses, ACTIVE_ORDER_STATUSES);
  checkOrderType(orderTypesSet, orderType);
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
  await closePosition(
    sdkManager,
    vaultAddress,
    { traderAddress: tonAddress, baseAsset, direction: Direction['long'], amount: traderPosition.size },
    wallet
  );
  await verifyThatPositionIsClosed(db, tonAddressRaw);
});

test(`Limit market order on synthetic BNB/USDT with fake oracle price changes`, async ({ wallet, sdkManager, db, tonAddress, tonAddressRaw }) => {
  test.setTimeout(60 * 12 * 1000);
  const { vaultAddress, quoteAssetId, baseAsset } = Config.getMarket('BNB/USDT');
  const quoteAssetName = Config.assetIdToName(quoteAssetId);
  const AMOUNT_OF_USDT = 1;
  const AMOUNT_IN_ASSET = Config.toAsset(quoteAssetName, AMOUNT_OF_USDT);
  const STOP_TRIGGER_PRICE = BigInt(3.9 * 1e9);
  const LIMIT_PRICE = BigInt(4 * 1e9);
  const orderParams = {
    orderType: 'stopLimit' as const,
    direction: Direction['long'],
    leverage: BigInt(20 * 1e9),
    amount: AMOUNT_IN_ASSET,
    baseAsset,
    expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
    stopTriggerPrice: STOP_TRIGGER_PRICE,
    takeTriggerPrice: 0n,
    stopPrice: 0n,
    traderAddress: tonAddress,
    limitPrice: LIMIT_PRICE,
  };
  await setTriggerPriceCommand(baseAsset, 4.5);
  await createOrder(sdkManager, vaultAddress, orderParams, wallet);
  const limitOrderType = 'limit';
  const stopOrderType = 'stop';
  let { orderHistory, actualOrderStatuses, orderTypesSet } = await getOrderHistoryLoop(db, tonAddressRaw, ACTIVE_ORDER_STATUSES);
  orderHistory.forEach(({ stop_trigger_price, limit_price }) => {
    expect
      .soft(Number(stop_trigger_price), 'Checking stop trigger price. Should be equal to the one set in initial orderParams')
      .toEqual(Number(STOP_TRIGGER_PRICE));
    expect.soft(Number(limit_price), 'Checking limit price. Should be equal to the one set in initial orderParams').toEqual(Number(LIMIT_PRICE));
  });
  checkOrderStatuses(actualOrderStatuses, ACTIVE_ORDER_STATUSES);
  checkOrderType(orderTypesSet, limitOrderType);
  await setTriggerPriceCommand(baseAsset, Number(LIMIT_PRICE) / 1e9 - 0.001);
  const {
    orderHistory: limitOrderRecordHistory,
    actualOrderStatuses: limitOrderActualOrderStatuses,
    orderTypesSet: limitOrderOrderTypesSet,
  } = await getOrderHistoryLoop(db, tonAddressRaw, EXECUTED_ORDER_STATUSES, limitOrderType);
  let executedOrderRecord = findOrderByStatus(limitOrderRecordHistory, 'executed');
  let activeOrderRecord = findOrderByStatus(limitOrderRecordHistory, 'active');
  checkOrderExecutionTime(executedOrderRecord, activeOrderRecord);
  checkOrderStatuses(limitOrderActualOrderStatuses, EXECUTED_ORDER_STATUSES);
  checkOrderType(limitOrderOrderTypesSet, limitOrderType);
  const { actualOrderStatuses: stopOrderActualOrderStatuses, orderTypesSet: stopOrderOrderTypesSet } = await getOrderHistoryLoop(
    db,
    tonAddressRaw,
    EXECUTED_ORDER_STATUSES,
    stopOrderType
  );
  checkOrderStatuses(stopOrderActualOrderStatuses, ['active']);
  checkOrderType(stopOrderOrderTypesSet, stopOrderType);
  const [traderPosition] = await db.getTraderPositions(tonAddressRaw);
  checkIndexPriceAndPositionStatus(traderPosition);
  // check that position is closed (because of stopLoss)
  await setTriggerPriceCommand(baseAsset, Number(STOP_TRIGGER_PRICE) / 1e9 - 0.001);
  await verifyThatPositionIsClosed(db, tonAddressRaw);
});

test.skip(
  `Verify that stop limit market order can be created and activated`,
  { tag: '@IN-DEV' },
  async ({ wallet, sdkManager, db, tonAddress, tonAddressRaw }) => {
    test.setTimeout(60 * 12 * 1000);
    const { vaultAddress, quoteAssetId, baseAsset } = Config.getMarket('BNB/USDT');
    const quoteAssetName = Config.assetIdToName(quoteAssetId);
    const AMOUNT_OF_USDT = 1;
    const AMOUNT_IN_ASSET = Config.toAsset(quoteAssetName, AMOUNT_OF_USDT);
    const STOP_TRIGGER_PRICE = 2.5;
    const STOP_TRIGGER_PRICE_IN_ASSET = Config.toAsset(quoteAssetName, STOP_TRIGGER_PRICE);
    const LIMIT_PRICE = 4;
    const LIMIT_PRICE_IN_ASSET = Config.toAsset(quoteAssetName, LIMIT_PRICE);
    const orderParams = {
      orderType: 'stopLimit' as const,
      direction: Direction['short'],
      leverage: BigInt(50 * 1e9),
      amount: AMOUNT_IN_ASSET,
      baseAsset,
      expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
      stopTriggerPrice: Config.toAsset(quoteAssetName, 99.5),
      takeTriggerPrice: 0n,
      stopPrice: 100n,
      traderAddress: tonAddress,
      limitPrice: Config.toAsset(quoteAssetName, 100),
    };
    await setTriggerPriceCommand(baseAsset, 3);
    await createOrder(sdkManager, vaultAddress, orderParams, wallet);
    const orderType = 'limit';
    let { orderHistory, actualOrderStatuses, orderTypesSet } = await getOrderHistoryLoop(db, tonAddressRaw, ACTIVE_ORDER_STATUSES);
    orderHistory.forEach(({ stop_trigger_price, limit_price }) => {
      expect
        .soft(Number(stop_trigger_price), 'Checking stop trigger price. Should be equal to the one set in initial orderParams')
        .toEqual(Number(STOP_TRIGGER_PRICE_IN_ASSET));
      expect
        .soft(Number(limit_price), 'Checking limit price. Should be equal to the one set in initial orderParams')
        .toEqual(Number(LIMIT_PRICE_IN_ASSET));
    });
    checkOrderStatuses(actualOrderStatuses, ACTIVE_ORDER_STATUSES);
    checkOrderType(orderTypesSet, orderType);
    await setTriggerPriceCommand(baseAsset, LIMIT_PRICE);
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
    // check that position is closed (because of stopLoss)
    await setTriggerPriceCommand(baseAsset, STOP_TRIGGER_PRICE);
    await verifyThatPositionIsClosed(db, tonAddressRaw);
  }
);

async function createOrder(sdkManager: _SdkManager, vaultAddress: string, orderParams: AsyncCreateOrderParams, wallet: Wallet) {
  const transaction = await sdkManager.createOrder(vaultAddress, orderParams);
  await sendTransaction(wallet, transaction);
}

type AsyncClosePositionParams = Omit<AsyncCreateOrderParams, 'orderType' | 'expiration'>;

async function closePosition(sdkManager: _SdkManager, vaultAddress: string, params: AsyncClosePositionParams, wallet: Wallet) {
  const transaction = await sdkManager.createOrder(vaultAddress, { ...params, orderType: 'takeProfit', trigerPrice: 0n, expiration: 0 });
  await sendTransaction(wallet, transaction);
}

async function sendTransaction(wallet: Wallet, transaction: TXParams) {
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
  expect.soft(traderPosition.status, 'Checking trader position status to be opened').toEqual('opened');
  const indexPrice = Number(traderPosition?.index_price);
  const exchangedQuote = Number(traderPosition?.exchanged_quote);
  const exchangedBase = Number(traderPosition?.exchanged_base);
  const priceImpact = (exchangedQuote / exchangedBase) * PRICE_IMPACT_COEFFICIENT;
  const lowerBound = indexPrice - priceImpact;
  const upperBound = indexPrice + priceImpact;
  expect.soft(indexPrice, 'Checking lower boundary of trader position index price').toBeGreaterThanOrEqual(lowerBound);
  expect.soft(indexPrice, 'Checking upper boundary of trader position index price').toBeLessThanOrEqual(upperBound);
}

function checkOrderStatuses(actualOrderStatuses: string[], expectedOrderStatuses: string[]) {
  expect.soft(actualOrderStatuses, `Checking order statuses. Expecting to have - ${expectedOrderStatuses.join(', ')}`).toEqual(expectedOrderStatuses);
}

function checkOrderType(actualOrderTypes: Set<string>, orderType: string) {
  expect.soft(actualOrderTypes, `Checking order types. Expecting to have orderType - ${orderType}`).toEqual(new Set([orderType]));
}

function checkOrderTypes(actualOrderTypes: Set<string>, orderType: string[]) {
  expect.soft(actualOrderTypes, `Checking order types. Expecting to have orderType - ${orderType}`).toEqual(new Set(orderType));
}

function findOrderByStatus(orderHistory: any[], status: string) {
  return orderHistory.find(({ status: orderStatus }) => orderStatus === status);
}

function findOrderByStatusAndType(orderHistory: any[], status: string, type: string) {
  return orderHistory.find(({ status: orderStatus, type: orderType }) => orderStatus === status && orderType === type);
}
