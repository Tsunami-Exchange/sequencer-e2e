import { ActivePositionsValidator, ActivePositionValidator } from '@/common/safeTypes';
import { ActivePositionsQuery, ActivePositionsVariables } from '@/queries/ActivePositions';
import { Config } from '@/utils/config';
import { GRAPHQL_URL } from '@/utils/constants';
import { sendToSequencer } from '@/utils/sequencer';
import { test } from '@fixtures/baseFixture';
import { Direction } from '@storm-trade/sdk';
import { beginCell, external, internal, storeMessage } from '@ton/core';
import { request as gqlRequest } from 'graphql-request';
import { expect } from 'playwright/test';
import { z } from 'zod';

// We can't run in parallel because of the seqno can't transfer from the same wallet in parallel
test('Verify that order can be created and handled by sequencer', async ({ wallet, sdkManager, config, db }) => {
  const market = config.getMarket('BTC/USDT');
  const { vaultAddress, baseAsset, quoteAssetId, address } = market;
  const traderAddress = wallet.getTonAddress();
  const quoteAssetName = Config.assetIdToName(quoteAssetId);
  const ASSET_AMOUNT = 1;
  const LEVERAGE = 50;
  const stopLossTriggerPrice = 99.5;
  const transaction = await sdkManager.createOrder(vaultAddress, {
    orderType: 'market',
    direction: Direction['long'],
    baseAsset,
    traderAddress,
    amount: Config.toAsset(quoteAssetName, ASSET_AMOUNT),
    leverage: BigInt(LEVERAGE * 1e9),
    expiration: Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 1000),
    stopTriggerPrice: Config.toAsset('TON', stopLossTriggerPrice),
    takeTriggerPrice: 0n,
    limitPrice: 0n,
  });
  const seqno = await wallet.getSeqno();
  const transfer = await wallet.createTransfer([internal(transaction)], seqno);
  const ext = beginCell()
    .store(storeMessage(external({ body: transfer, to: wallet.getTonAddress() })))
    .endCell();
  await sendToSequencer(ext);
  await wallet.waitSeqno(seqno);
  const traderRawString = traderAddress.toRawString();
  // Graphql checks are gonna be preset only for this test because the GOAL is to test database consistensy only
  const gqlResponse: { getActivePositions: z.infer<typeof ActivePositionsValidator> } = await gqlRequest({
    url: GRAPHQL_URL,
    document: ActivePositionsQuery(),
    variables: ActivePositionsVariables(traderRawString, address),
  });
  expect(ActivePositionValidator.safeParse(gqlResponse.getActivePositions.long).success).toBeTruthy();
  expect(ActivePositionsValidator.safeParse(gqlResponse.getActivePositions).success).toBeTruthy();
  expect(gqlResponse.getActivePositions.orders).toHaveLength(1);
  const traderPositions = await db.getTraderPositions(traderRawString);
  const orderHistory = await db.getOrderHistory(traderRawString);
  const ordersV2 = await db.getOrderV2(traderRawString);
  console.log('ordersV2', ordersV2);
  console.log('traderPositions', traderPositions);
  console.log('orderHistory', orderHistory);
});
