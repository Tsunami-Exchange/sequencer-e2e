import { Config } from '@/utils/config';
import { sendToSequencer } from '@/utils/sequencer';
import { test } from '@fixtures/baseFixture';
import { Direction } from '@storm-trade/sdk';
import { beginCell, external, internal, storeMessage } from '@ton/core';

test('Verify that order can be created and handled by sequencer', async ({ walletClient, sdkManager }) => {
  const wallet = walletClient.getWallet('wallet0');
  const market = walletClient.getMarkets('BTC/USDT');
  const { vaultAddress, baseAsset, quoteAssetId } = market;
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
});
