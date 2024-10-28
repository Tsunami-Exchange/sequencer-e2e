import { test as base, expect } from '@playwright/test';
import { Config, ConfigContainer } from '../utils/config';
import { _SdkManager, SdkManager } from '../utils/sdk-manager';
import { TonLiteClient } from '../utils/lite-client';
import { LiteClient } from 'ton-lite-client';
import { Wallet } from '../utils/wallet';
import { mnemonicNew } from '@ton/crypto';
import DatabaseClient from '@/utils/db';
import { Client } from 'pg';
import { Address } from '@ton/core';

export const test = base.extend<{
  liteClient: LiteClient;
  treasury: Wallet;
  sdkManager: _SdkManager;
  config: ConfigContainer;
  wallet: Wallet;
  db: DatabaseClient<Client>;
  tonAddress: Address;
  tonAddressRaw: string;
}>({
  liteClient: async ({}, use) => {
    await use(await TonLiteClient.init());
  },

  treasury: async ({ liteClient }, use) => {
    const treasurySeed = process.env.TREASURY_SEED;
    if (!treasurySeed) {
      throw new Error('TREASURY_SEED environment variable is not set');
    }
    const treasury = new Wallet(liteClient, treasurySeed, 'treasury');
    await treasury.init();
    await use(treasury);
  },
  wallet: async ({ liteClient, treasury, config }, use) => {
    const seed = await mnemonicNew();
    const wallet = new Wallet(liteClient, seed.join(' '), 'wallet');
    await wallet.init();
    const assets = config.config().assets.filter(({ assetId }) => assetId !== 'TON');
    await Promise.all(
      assets.map(async (asset) => {
        await treasury.addJetton(asset.name, asset.assetId);
      })
    );
    const newWalletAddress = wallet.getTonAddress();
    const defaultAssets = ['TON', 'NOT', 'USDT'];
    for (const asset of defaultAssets) await treasury.transfer(asset, newWalletAddress, 1);
    await wallet.waitForAccountStateToBeDeployed(newWalletAddress);
    await wallet.init();
    assets.map(async (asset) => {
      await wallet.addJetton(asset.name, asset.assetId);
    });
    await expect(async () => {
      const [tonBalance, ...balances] = await Promise.all(
        defaultAssets.map(async (asset) => {
          return await wallet.getBalance(asset);
        })
      );
      expect(tonBalance).toBeGreaterThan(0.3);
      expect(balances).toEqual([1, 1]);
    }).toPass({
      // Probe, wait 1s, probe, wait 2s, probe, wait 10s, probe, wait 10s, probe
      // ... Defaults to [100, 250, 500, 1000].
      intervals: [1_000],
      timeout: 300000,
    });
    await use(wallet);
  },
  tonAddress: async ({ wallet }, use) => {
    const tonAddress = wallet.getTonAddress();
    await use(tonAddress);
  },
  tonAddressRaw: async ({ tonAddress }, use) => {
    const tonAddressRaw = tonAddress.toRawString();
    await use(tonAddressRaw);
  },
  sdkManager: async ({ liteClient }, use) => {
    await use(await SdkManager.init(liteClient));
  },

  db: async ({}, use) => {
    const db = new DatabaseClient();
    await use(db);
    await db.disconnect();
  },

  config: async ({}, use) => {
    await use(await Config.init());
  },
});
