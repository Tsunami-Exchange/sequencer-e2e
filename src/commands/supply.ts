import { WalletsContainer } from '../utils/wallets';
import { MessageRelaxed } from '@ton/ton';

export const supplyCommand = async (assets: string[]) => {
  const treasury = WalletsContainer.getWallet('treasury');
  const wallets = Object.values(WalletsContainer.getWallets()).filter((wallet) => wallet.name !== 'treasury');
  const required: Record<string, Record<string, number>> = {};
  for (const wallet of wallets) {
    const address = wallet.getTonAddress().toRawString();
    for (let i = 0; i < assets.length; i += 2) {
      const assetName = assets[i + 1]!;
      const amount = assets[i]!;
      required[address] ??= {};
      required[address][assetName] = Number(amount);
    }
  }
  let buffer: MessageRelaxed[] = [];
  for (const [address, amounts] of Object.entries(required)) {
    for (const [assetName, amount] of Object.entries(amounts)) {
      console.log(`Transferring ${amount} ${assetName} ${treasury.name} -> ${address}`);
      buffer.push(await treasury.createTransferMessage(assetName, address, amount));
      if (buffer.length === 4) {
        await treasury.send(buffer);
        buffer = [];
      }
    }
  }
  await WalletsContainer.deployContracts();
};
