import { Config } from './config';
import { Address } from '@ton/ton';
import { AsyncCancelOrderParams, AsyncClosePositionParams, AsyncCreateOrderParams, Direction, StormSDK } from '@storm-trade/sdk';
import { ORACLE_URL } from './constants';
import { LiteClient } from 'ton-lite-client';
import { setTimeout } from 'node:timers/promises';

export class _SdkManager {
  private sdkInstances: Record<string, StormSDK> = {};

  async init(client: LiteClient) {
    const config = Config.config();

    const assetsResponse = await fetch('https://raw.githubusercontent.com/Tsunami-Exchange/chain-config/main/assets.testnet.json');
    const assetsConfig = await assetsResponse.json();

    for (const vaultSource of config.liquiditySources) {
      const params: any = {
        oracleURL: ORACLE_URL,
        assetsConfig,
      };

      const isNative = vaultSource.asset.name === 'TON';

      params['vaultAddress'] = Address.parse(vaultSource.vaultAddress);
      if (!isNative) {
        params['jettonMasterAddress'] = Address.parse(vaultSource.asset.assetId);
      }
      this.sdkInstances[vaultSource.vaultAddress] = new StormSDK(client as any, {
        ...params,
        vaultKind: !isNative ? 'jetton' : 'native',
      });
    }
    return this;
  }

  getSdk(vaultAddress: string): StormSDK {
    if (!this.sdkInstances[vaultAddress]) {
      throw new Error(`Sdk for vault ${vaultAddress} not found`);
    }
    return this.sdkInstances[vaultAddress];
  }

  async createOrder(vaultAddress: string, params: AsyncCreateOrderParams) {
    const sdk = this.getSdk(vaultAddress);
    return sdk.createOrder(params);
  }

  async cancelOrder(vaultAddress: string, params: AsyncCancelOrderParams) {
    const sdk = this.getSdk(vaultAddress);
    return sdk.cancelOrder(params);
  }

  async getPosition(vaultAddress: string, traderAddress: Address, assetName: string) {
    const sdk = this.getSdk(vaultAddress);
    return sdk.getPositionAccountData(traderAddress, assetName);
  }

  async waitPositionOpen(vaultAddress: string, traderAddress: Address, assetName: string, direction: Direction) {
    const sdk = this.getSdk(vaultAddress);
    let opened = false;
    while (!opened) {
      const positionData = await sdk.getPositionAccountData(traderAddress, assetName);
      opened = (!!positionData?.longPosition && direction === Direction.long) || (!!positionData?.shortPosition && direction === Direction.short);
      if (!opened) {
        await setTimeout(100);
      }
    }
  }

  async closePosition(vaultAddress: string, params: AsyncClosePositionParams) {
    const sdk = this.getSdk(vaultAddress);
    return sdk.closePosition(params);
  }
}

export const SdkManager = new _SdkManager();
