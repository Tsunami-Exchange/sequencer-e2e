import { ActivePositionsValidator, ActivePositionValidator } from '@/common/safeTypes';
import { ActivePositionsQuery, ActivePositionsVariables } from '@/queries/ActivePositions';
import { Config } from '@/utils/config';
import { GRAPHQL_URL } from '@/utils/constants';
import { _SdkManager } from '@/utils/sdk-manager';
import { sendToSequencer } from '@/utils/sequencer';
import { test } from '@fixtures/baseFixture';
import { AsyncCreateOrderParams, Direction, orderTypesNumsToNames, OrderTypes } from '@storm-trade/sdk';
import { Address, beginCell, external, internal, storeMessage } from '@ton/core';
import { request as gqlRequest } from 'graphql-request';
import { expect } from 'playwright/test';
import { z } from 'zod';
import { Market } from '../utils/config';

// We can't run in parallel because of the seqno can't transfer from the same wallet in parallel

await Config.init();
const MARKET = Config.getMarket('BTC/USDT');
const { vaultAddress, quoteAssetId, baseAsset } = MARKET;
const quoteAssetName = Config.assetIdToName(quoteAssetId);

const orderParams = [
  {
    orderType: 'market' as const,
    direction: Direction['long'],
    leverage: BigInt(50 * 1e9),
    amount: Config.toAsset(quoteAssetName, 1),
    baseAsset,
    expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
    stopTriggerPrice: 0n,
    takeTriggerPrice: 0n,
    limitPrice: 0n,
  },
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

orderParams.forEach(async (params) => {
  test(`Verify that order ${params.orderType} with ${params.stopPrice} can be created and handled by sequencer`, async ({
    wallet,
    sdkManager,
    db,
  }) => {
    const traderAddress = wallet.getTonAddress();
    const transaction = await sdkManager.createOrder(vaultAddress, { ...params, traderAddress });
    const seqno = await wallet.getSeqno();
    const transfer = await wallet.createTransfer([internal(transaction)], seqno);
    const ext = beginCell()
      .store(storeMessage(external({ body: transfer, to: wallet.getTonAddress() })))
      .endCell();
    await sendToSequencer(ext);
    await wallet.waitSeqno(seqno);
    const traderRawString = traderAddress.toRawString();
    await new Promise((resolve) => setTimeout(resolve, 120 * 1000));
    const promises = [await db.getOrderHistory(traderRawString), await db.getOrderV2(traderRawString), await db.getTraderPositions(traderRawString)];
    const [orderHistory, ordersV2, traderPositions] = await Promise.all(promises);
    console.log('trader address', traderRawString);
    console.log('orders', orderHistory);
    console.log('ordersV2', ordersV2);
    console.log('traderPositions', traderPositions);
  });
});
