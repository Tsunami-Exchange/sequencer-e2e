import {
  Address,
  beginCell,
  Cell,
  internal,
  JettonWallet,
  MessageRelaxed,
  OpenedContract,
  parseTuple,
  serializeTuple,
  TupleBuilder,
  TupleReader,
  WalletContractV4,
} from '@ton/ton';
import { KeyPair, mnemonicToPrivateKey } from '@ton/crypto';
import { toAddress } from './to-address';
import { TRANSFER_FEE } from './constants';
import { LiteClient } from 'ton-lite-client';
import * as util from 'node:util';
import { Config } from './config';
import { setTimeout } from 'node:timers/promises';
import { requireBalance } from './require-balance';

type ContractState = {
  active: boolean;
  deployed: boolean;
};

export class Wallet {
  private tonContract: OpenedContract<WalletContractV4>;
  private tonContractState: ContractState = { active: false, deployed: false };
  private jettonContracts: Record<string, OpenedContract<JettonWallet>> = {};
  private jettonContractStates: Record<string, ContractState> = {};
  private jettonMasters: Record<string, Address> = {};
  private keys: KeyPair;

  constructor(
    private client: LiteClient,
    private mnemonic: string,
    public readonly name: string
  ) {}

  async init() {
    this.keys = await mnemonicToPrivateKey(this.mnemonic.split(' '));
    const tonWallet = WalletContractV4.create({
      workchain: 0,
      publicKey: this.keys.publicKey,
    });
    this.tonContract = this.client.open(tonWallet);
    this.tonContractState = await this.checkContractState(tonWallet.address);
  }

  private async waitContractDeploy(address: Address) {
    let state = undefined;
    while (state !== 'active') {
      const master = await this.client.getMasterchainInfo();
      const updatedAccountState = await this.client.getAccountState(address, master.last);
      state = updatedAccountState.state?.storage?.state.type;
    }
  }

  async waitForAccountStateToBeDeployed(address: Address) {
    const master = await this.client.getMasterchainInfo();
    const accountState = await this.client.getAccountState(address, master.last);
    do {
      const master = await this.client.getMasterchainInfo();
      const updatedAccountState = await this.client.getAccountState(address, master.last);
      accountState.state = updatedAccountState.state;
    } while (accountState.state === null);
  }

  async checkContractState(address: Address): Promise<ContractState> {
    const master = await this.client.getMasterchainInfo();
    const accountState = await this.client.getAccountState(address, master.last);
    const state: ContractState = {
      deployed: accountState.state !== null,
      active: accountState.state?.storage?.state.type === 'active',
    };
    if (state.deployed && !state.active) {
      const seqno = await this.tonContract.getSeqno();
      console.log(`Wallet ${this.name} deploying contract`);
      await this.tonContract.sendTransfer({
        seqno,
        secretKey: this.keys.secretKey,
        messages: [
          internal({
            init: this.tonContract.init,
            bounce: false,
            to: this.getTonAddress(),
            value: TRANSFER_FEE,
          }),
        ],
      });
      await this.waitSeqno(seqno);
      await this.waitContractDeploy(this.getTonAddress());
      console.log(`Wallet ${this.name} contract deployed`);
    }
    return state;
  }

  private async parseJettonAddress(userAddress: Address, jettonMasterAddress: Address) {
    const userAddressCell = beginCell().storeAddress(userAddress).endCell();
    const master = await this.client.getMasterchainInfo();
    const params = new TupleBuilder();
    params.writeSlice(userAddressCell);
    const response = await this.client.runMethod(jettonMasterAddress, 'get_wallet_address', serializeTuple(params.build()).toBoc(), master.last);
    if (!response.result) {
      throw new Error('get_wallet_address returned no result');
    }

    const resultTuple = parseTuple(Cell.fromBoc(Buffer.from(response.result, 'base64'))[0]!);
    const parsed = new TupleReader(resultTuple);

    return parsed.readAddress();
  }

  // add timeout / time-limit
  async waitSeqno(seqno: number, interval = 100, timeout = 80000) {
    const start = Date.now();
    let currentSeqno = seqno;
    while (currentSeqno === seqno) {
      await setTimeout(interval);

      try {
        currentSeqno = await this.tonContract.getSeqno();
      } catch (_) {
        // ignore
      }

      if (Date.now() - start > timeout) {
        throw new Error(`Timed out waiting for seqno to change from ${seqno}`);
      }
    }
    console.log('New seqno is', currentSeqno);
    return currentSeqno;
  }

  private getJettonContract(name: string) {
    if (!this.jettonContracts[name]) {
      throw new Error(`Jetton contract ${name} not found`);
    }
    return this.jettonContracts[name];
  }

  private getJettonMaster(name: string) {
    if (!this.jettonMasters[name]) {
      throw new Error(`Jetton contract ${name} not found`);
    }
    return this.jettonMasters[name];
  }

  private async createJettonTransferMessage(master: Address, to: Address, amount: bigint) {
    const fromJetton = await this.parseJettonAddress(this.tonContract.address, master);

    const messageBody = beginCell()
      .storeUint(0x0f8a7ea5, 32) // opcode for jetton transfer
      .storeUint(0, 64) // query id
      .storeCoins(amount) // jetton amount, amount * 10^9
      .storeAddress(to)
      .storeAddress(to) // response destination
      .storeBit(0) // no custom payload
      .storeCoins(0) // forward amount - if >0, will send notification message
      .storeBit(0) // we store forwardPayload as a reference
      .endCell();

    return internal({
      to: fromJetton,
      value: TRANSFER_FEE,
      bounce: true,
      body: messageBody,
    });
  }

  async addJetton(name: string, master: Address | string) {
    const masterAddress = typeof master === 'string' ? Address.parse(master) : master;
    this.jettonMasters[name] = masterAddress;
    const jettonAddress = await this.parseJettonAddress(this.tonContract.address, masterAddress);
    const jettonWallet = JettonWallet.create(jettonAddress);
    this.jettonContracts[name] = this.client.open(jettonWallet);
    this.jettonContractStates[name] = await this.checkContractState(jettonWallet.address);
  }

  getMnemonic() {
    return this.mnemonic;
  }

  async getTonBalance(): Promise<bigint> {
    return this.tonContract.getBalance();
  }

  async getJettonBalance(name: string): Promise<bigint> {
    const contract = this.getJettonContract(name);
    return contract.getBalance();
  }

  async getSeqno(): Promise<number> {
    return this.tonContract.getSeqno();
  }

  async createTransfer(messages: MessageRelaxed[], seqno: number) {
    return this.tonContract.createTransfer({
      seqno,
      secretKey: this.keys.secretKey,
      messages,
    });
  }

  private async tonTransfer(to: Address | string, amount: bigint): Promise<void> {
    const seqno = await this.tonContract.getSeqno();
    await this.tonContract.sendTransfer({
      seqno,
      secretKey: this.keys.secretKey,
      messages: [
        internal({
          bounce: false,
          to: toAddress(to),
          value: amount,
        }),
      ],
    });
    await this.waitSeqno(seqno);
  }

  private async jettonTransfer(jettonName: string, to: Address | string, amount: bigint): Promise<void> {
    const jettonMaster = this.getJettonMaster(jettonName);
    const transfer = await this.createJettonTransferMessage(jettonMaster, toAddress(to), amount);
    const seqno = await this.tonContract.getSeqno();
    await this.tonContract.sendTransfer({
      seqno,
      secretKey: this.keys.secretKey,
      messages: [transfer],
    });
    await this.waitSeqno(seqno);
  }

  async getAllBalances(): Promise<Record<string, number>> {
    return Object.fromEntries(
      await Promise.all([
        this.getTonBalance().then(async (result) => ['TON', Config.fromAsset('TON', result)] as const),
        ...Object.keys(this.jettonContracts).map(async (name) => {
          return [name, Config.fromAsset(name, await this.getJettonBalance(name))];
        }),
      ])
    );
  }

  getTonAddress(): Address {
    return this.tonContract.address;
  }

  getJettonAddress(assetName: string): Address {
    return this.getJettonContract(assetName).address;
  }

  async getBalance(assetName: string): Promise<number> {
    if (assetName === 'TON') {
      const balance = await this.getTonBalance();
      return Config.fromAsset('TON', balance);
    }
    const balance = await this.getJettonBalance(assetName);
    return Config.fromAsset(assetName, balance);
  }

  async send(messages: MessageRelaxed[]): Promise<void> {
    const seqno = await this.tonContract.getSeqno();
    await this.tonContract.sendTransfer({
      seqno,
      secretKey: this.keys.secretKey,
      messages,
    });
    await this.waitSeqno(seqno);
  }

  async createTransferMessageRaw(assetName: string, to: Address | string, amount: bigint) {
    if (assetName === 'TON') {
      return internal({
        bounce: false,
        to: toAddress(to),
        value: amount,
      });
    }
    const jettonMaster = this.getJettonMaster(assetName);
    return this.createJettonTransferMessage(jettonMaster, toAddress(to), amount);
  }

  async createTransferMessage(assetName: string, to: Address | string, amount: number) {
    const assetAmount = Config.toAsset(assetName, amount);
    return this.createTransferMessageRaw(assetName, to, assetAmount);
  }

  async transferRaw(assetName: string, to: Address | string, amount: bigint): Promise<void> {
    if (amount === 0n) {
      return;
    }
    if (assetName === 'TON') {
      return this.tonTransfer(to, amount);
    }
    return this.jettonTransfer(assetName, to, amount);
  }

  async transfer(assetName: string, to: Address | string, amount: number): Promise<void> {
    const assetAmount = Config.toAsset(assetName, amount);
    await requireBalance(this, assetName, amount, [TRANSFER_FEE]);
    return this.transferRaw(assetName, to, assetAmount);
  }

  async receive(assetName: string, from: Wallet, amount: number): Promise<void> {
    await from.transfer(assetName, this.getTonAddress(), amount);
  }

  [util.inspect.custom]() {
    return `Wallet:${this.name}`;
  }
}
