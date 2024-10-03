import walletsConfig from '../../wallets.json';
import { Wallet } from './wallet';
import { Config, Market } from './config';
import { TonLiteClient } from './lite-client';
import { LiteClient } from 'ton-lite-client';

type WalletConfig = {
  seed: string;
  name?: string;
};

export class Wallets {
  private readonly wallets: Record<string, Wallet> = {};
  private configClient: typeof Config;
  private initialized = false;
  private liteClient: LiteClient;

  async init() {
    if (this.initialized) {
      return this;
    }
    this.liteClient = await TonLiteClient.init();
    this.configClient = await Config.init();
    const jettonAssets = this.configClient.config().assets.filter(({ assetId }) => assetId !== 'TON');
    await Promise.all(
      walletsConfig.map(async (walletConfig: WalletConfig, idx) => {
        const name = walletConfig.name ?? `wallet${idx}`;
        const wallet = await this.initWallet(walletConfig.seed, name);
        await Promise.all(
          jettonAssets.map(async (asset) => {
            await wallet.addJetton(asset.name, asset.assetId);
          })
        );
        this.wallets[name] = wallet;
      })
    );
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

  getWallets() {
    return this.wallets;
  }

  close() {
    TonLiteClient.close();
  }
}

export const WalletsContainer = new Wallets();
