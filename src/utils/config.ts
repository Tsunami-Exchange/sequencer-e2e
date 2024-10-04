import { CONFIG_URL } from './constants';

export type Asset = {
  name: string;
  decimals: number;
  assetId: string;
};

export type Market = {
  address: string;
  quoteAsset: string;
  baseAsset: string;
  name: string;
  ticker: string;
  quoteAssetId: string;
  settlementToken: string;
  type: string;
  vaultAddress: string;
};

export type LiquiditySource = {
  asset: Asset;
  vaultAddress: string;
  quoteAssetId: string;
  lpJettonMaster: string;
};

export type StormConfig = {
  referralCollectionAddress: string;
  genesisCollectionAddress: string;
  assets: Asset[];
  openedMarkets: Market[];
  liquiditySources: LiquiditySource[];
};

export class ConfigContainer {
  private cfg: StormConfig;
  private assetIdToNameMap: Record<string, string>;
  private jettonDecimals: Record<string, number>;
  private initialized = false;

  async init() {
    if (this.initialized) {
      return this;
    }
    const response = await fetch(CONFIG_URL);
    this.cfg = (await response.json()) as StormConfig;
    this.assetIdToNameMap = Object.fromEntries(this.cfg.assets.map((asset) => [asset.assetId, asset.name]));
    this.jettonDecimals = Object.fromEntries(this.cfg.assets.map((asset) => [asset.name, asset.decimals]));
    return this;
  }

  config() {
    return this.cfg;
  }

  assetIdToName(assetId: string): string {
    if (!this.assetIdToNameMap[assetId]) {
      throw new Error(`Asset id ${assetId} not found`);
    }
    return this.assetIdToNameMap[assetId];
  }

  getMarket(marketName: string): Market {
    const market = this.cfg.openedMarkets.find((market) => market.ticker === marketName);
    if (!market) {
      throw new Error(`Market ${marketName} not found`);
    }
    return market;
  }

  toAsset(assetName: string, amount: number): bigint {
    if (assetName === 'TON') {
      return BigInt(amount * 10 ** 9);
    }
    if (!this.jettonDecimals[assetName]) {
      throw new Error(`Jetton asset ${assetName} not found`);
    }
    return BigInt(amount * 10 ** this.jettonDecimals[assetName]);
  }

  fromAsset(assetName: string, amount: bigint): number {
    if (assetName === 'TON') {
      return Number(amount) / 10 ** 9;
    }
    if (!this.jettonDecimals[assetName]) {
      throw new Error(`Jetton asset ${assetName} not found`);
    }
    return Number(amount) / 10 ** this.jettonDecimals[assetName];
  }
}

export const Config = new ConfigContainer();
