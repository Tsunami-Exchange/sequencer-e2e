import { test as base } from '@playwright/test';
import { Config, ConfigContainer } from '../utils/config';
import { WalletsContainer } from '../utils/wallets';
import { _SdkManager, SdkManager } from '../utils/sdk-manager';
import { TonLiteClient } from '../utils/lite-client';
import { LiteClient } from 'ton-lite-client';
import { Wallets } from '../utils/wallets';

export const test = base.extend<{
  liteClient: LiteClient;
  walletClient: Wallets;
  sdkManager: _SdkManager;
  config: ConfigContainer;
}>({
  liteClient: async ({}, use) => {
    await use(await TonLiteClient.init());
  },

  walletClient: async ({}, use) => {
    await use(await WalletsContainer.init());
  },

  sdkManager: async ({ liteClient }, use) => {
    await use(await SdkManager.init(liteClient));
  },

  config: async ({}, use) => {
    await use(await Config.init());
  },
});

// import { retry } from '../utils/retry';
// import { sendToSequencer } from '../utils/sequencer';
// test('create order', async () => {
//   const seqno = await w.getSeqno();
//   const transfer = await w.createTransfer([internal(tx)], seqno);
//   const ext = beginCell()
//     .store(storeMessage(external({ body: transfer, to: w.getTonAddress() })))
//     .endCell();
//   await retry(() => sendToSequencer(ext), {
//     shouldRetry: (error) => (error ? error.message.includes('exitcode=33') || error.message.includes('fetch failed') : false),
//     maxRetries: 5,
//   });
//   await w.waitSeqno(seqno);
// });
