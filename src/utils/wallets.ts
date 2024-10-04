import { Wallet } from './wallet';
import { Config, Market } from './config';
import { TonLiteClient } from './lite-client';
import { LiteClient } from 'ton-lite-client';
import { mnemonicNew } from '@ton/crypto';
import { randomUUID } from 'crypto';
import { requireBalance } from './require-balance';
import { TRANSFER_FEE } from './constants';
import { expect } from 'playwright/test';

export class Wallets {
  private readonly wallets: Record<string, Wallet> = {};
  private configClient: typeof Config;
  private initialized = false;
  private liteClient: LiteClient;
  private jettonAssets: { name: string; assetId: string }[];

  async init() {
    if (this.initialized) {
      return this;
    }
    this.liteClient = await TonLiteClient.init();
    this.configClient = await Config.init();
    this.jettonAssets = this.configClient.config().assets.filter(({ assetId }) => assetId !== 'TON');
    const treasuryWallet = await this.initWallet(treasurySeed, 'treasury');
    await Promise.all(
      this.jettonAssets.map(async (asset) => {
        await treasuryWallet.addJetton(asset.name, asset.assetId);
      })
    );
    this.wallets['treasury'] = treasuryWallet;
    this.initialized = true;
    return this;
  }

  async deployContracts() {
    await Promise.all(Object.values(this.wallets).map((wallet) => wallet.checkContractState(wallet.getTonAddress())));
  }

  hasWallet(name: string) {
    return !!this.wallets[name];
  }

  getMarkets(marketNames: string): Market {
    const marketsFilter = (Array.isArray(marketNames) ? marketNames : [marketNames]).map((market) => {
      const [left, right] = market.split('/');
      if (!left || !right) {
        throw new Error('Malformed market name');
      }
      return new RegExp(`^${left === '*' ? '.*?' : left}\/${right === '*' ? '.*?' : right}$`);
    });
    const markets: Market[] = this.configClient.config().openedMarkets.filter((market) => {
      return marketsFilter.some((filter) => filter.test(market.ticker));
    });

    if (markets[0] === undefined) {
      throw new Error('No markets found');
    }
    return markets[0];
  }

  async initWallet(seed: string, name: string) {
    const wallet = new Wallet(this.liteClient, seed, name);
    await wallet.init();
    return wallet;
  }

  getWallet(name: string) {
    if (!this.wallets[name]) {
      throw new Error(`Wallet ${name} not found`);
    }
    return this.wallets[name];
  }

  async createWallet(amountOfUSDT: number = 1, amountOfTON: number = 1): Promise<Wallet> {
    const name = `wallet-${randomUUID()}`;
    const seed = await mnemonicNew();
    // transfer from treasury to this new wallet
    const wallet = new Wallet(this.liteClient, seed.join(' '), name);
    await wallet.init();
    await Promise.all(
      this.jettonAssets.map(async (asset) => {
        await wallet.addJetton(asset.name, asset.assetId);
      })
    );
    await Promise.all([this.transferToWallet(wallet, 'TON', amountOfTON), this.transferToWallet(wallet, 'USDT', amountOfUSDT)]);

    await wallet.init();
    return wallet;
  }

  async transferToWallet(wallet: Wallet, asset: string, amount: number) {
    const fromWallet = WalletsContainer.getWallet('treasury');
    const toWallet = wallet.getTonAddress();
    await requireBalance(fromWallet, asset, amount, [TRANSFER_FEE]);
    console.log(`Transferring ${amount} ${asset} from wallet ${fromWallet.getTonAddress().toRawString()} -> ${toWallet.toRawString()}`);
    const intitialBalance = await wallet.getBalance(asset);
    await fromWallet.transfer(asset, toWallet, amount);
    let currentBalance;
    await expect(async () => {
      currentBalance = await wallet.getBalance(asset);
      console.log(`current balance of ${asset} on ${toWallet} =`, currentBalance);
      expect(currentBalance).toBe(amount + intitialBalance);
    }).toPass({ timeout: 60000, intervals: [1000] });

    console.log('Transfer complete');
  }

  getWallets() {
    return this.wallets;
  }

  close() {
    TonLiteClient.close();
  }
}

export const WalletsContainer = new Wallets();
