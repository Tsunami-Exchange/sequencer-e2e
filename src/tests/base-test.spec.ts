import { setTriggerPriceCommand } from '@/commands/set-trigger-price';
import { Config } from '@/utils/config';
import { _SdkManager } from '@/utils/sdk-manager';
import { sendToSequencer } from '@/utils/sequencer';
import { test } from '@fixtures/baseFixture';
import { Direction } from '@storm-trade/sdk';
import { beginCell, external, internal, storeMessage } from '@ton/core';
import { expect } from 'playwright/test';

// We can't run in parallel because of the seqno can't transfer from the same wallet in parallel

await Config.init();
const MARKET = Config.getMarket('BTC/USDT');
const { vaultAddress, quoteAssetId, baseAsset } = MARKET;
const quoteAssetName = Config.assetIdToName(quoteAssetId);

const testCases = [
  // Default limit order
  {
    orderType: 'stopLimit' as const,
    direction: Direction['short'],
    leverage: BigInt(50 * 1e9),
    amount: Config.toAsset(quoteAssetName, 1),
    baseAsset,
    expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
    stopTriggerPrice: Config.toAsset(quoteAssetName, 99.5),
    takeTriggerPrice: 0n,
    stopPrice: 0n,
    limitPrice: Config.toAsset(quoteAssetName, 100),
  },
  // stopLimit order type
  {
    orderType: 'stopLimit' as const,
    direction: Direction['short'],
    leverage: BigInt(50 * 1e9),
    amount: Config.toAsset(quoteAssetName, 1),
    baseAsset,
    expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
    stopTriggerPrice: Config.toAsset(quoteAssetName, 99.5),
    takeTriggerPrice: 0n,
    stopPrice: 100n,
    limitPrice: Config.toAsset(quoteAssetName, 100),
  },
];

// create separate test where market first would be opened and then separate transaction to create takeProfit position and StopLoss position in the same direction
test(`Verify that order open market order can be created`, async ({ wallet, sdkManager, db }) => {
  const traderAddress = wallet.getTonAddress();
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
  let actualOrderStatuses;
  let orderTypesSet;
  let orderHistory;
  const endTime = Date.now() + 5 * 60 * 1000;
  // check order statuses in order history after 5 min interval (pending to executed (all statuses) )
  while (Date.now() < endTime) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    orderHistory = await db.getOrderHistory(traderRawString);
    actualOrderStatuses = orderHistory.map(({ status }) => status);
    orderTypesSet = new Set(orderHistory.map(({ type }) => type));
    if (actualOrderStatuses.every((value, index) => value === orderStatuses[index])) {
      break;
    }
  }
  // check that event_created of active orderType and executed not more than 1 min (soft assertion)
  expect(actualOrderStatuses).toEqual(orderStatuses);
  expect(orderTypesSet).toEqual(new Set([orderType]));
  const [traderPosition] = await db.getTraderPositions(traderRawString);
  expect(traderPosition.status).toEqual('opened');
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

test(`Verify that stop market order can be created and activated via fake oracle price equal to stop limit price`, async ({
  wallet,
  sdkManager,
  db,
}) => {
  const traderAddress = wallet.getTonAddress();
  // stop market order
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
  let orderStatuses = ['seq_pending', 'active', 'tx_sent'];
  const orderType = 'limit';
  let actualOrderStatuses;
  let orderTypesSet;
  let orderHistory;
  const endTime = Date.now() + 5 * 60 * 1000;
  // check order statuses in order history after 5 min interval (pending to executed (all statuses) )
  while (Date.now() < endTime) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    orderHistory = await db.getOrderHistory(traderRawString);
    actualOrderStatuses = orderHistory.map(({ status }) => status);
    orderTypesSet = new Set(orderHistory.map(({ type }) => type));
    if (actualOrderStatuses.length === orderStatuses.length && actualOrderStatuses.every((value, index) => value === orderStatuses[index])) {
      break;
    }
  }
  expect(actualOrderStatuses).toEqual(orderStatuses);
  expect(orderTypesSet).toEqual(new Set([orderType]));
  orderStatuses = ['seq_pending', 'active', 'tx_sent', 'executed'];
  await setTriggerPriceCommand(baseAsset, 1.1);
  while (Date.now() < endTime) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    orderHistory = await db.getOrderHistory(traderRawString);
    actualOrderStatuses = orderHistory.map(({ status }) => status);
    orderTypesSet = new Set(orderHistory.map(({ type }) => type));
    if (actualOrderStatuses.every((value, index) => value === orderStatuses[index])) {
      break;
    }
  }
  const [traderPosition] = await db.getTraderPositions(traderRawString);
  expect(traderPosition.status).toEqual('opened');
  // for non default market orders we should check by trigger price instead of index price + coefficient should be very small
  const PRICE_IMPACT_COEFFICIENT = 0.002;
  const lowerBoundary = traderPosition.trigger_price - (traderPosition.exchange_qoute / traderPosition.exchange_base) * PRICE_IMPACT_COEFFICIENT; //
  const upperBoundary = traderPosition.trigger_price + (traderPosition.exchange_qoute / traderPosition.exchange_base) * PRICE_IMPACT_COEFFICIENT; //
  expect(Number(traderPosition.trigger_price)).toBeGreaterThanOrEqual(lowerBoundary);
  expect(Number(traderPosition.trigger_price)).toBeLessThanOrEqual(upperBoundary);
  /* trader position / order v2 table in db (checking index price + exchange_qoute / exchange_base compare it to index_price)
    with price impact coefficient derivation (0.02% for example) */
  console.log('trader address', traderRawString);
  console.log('orders', orderHistory);
});
