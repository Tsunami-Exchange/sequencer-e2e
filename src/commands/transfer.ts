import { WalletsContainer } from '../utils/wallets';
import { requireBalance } from '../utils/require-balance';
import { TRANSFER_FEE } from '../utils/constants';
import { Address } from '@ton/ton';

export const transferCommand = async (amount: number, asset: string, from: string, to: string) => {
  const fromWallet = WalletsContainer.getWallet(from);
  const toWallet = WalletsContainer.hasWallet(to) ? WalletsContainer.getWallet(to).getTonAddress() : Address.parse(to);
  await requireBalance(fromWallet, asset, amount, [TRANSFER_FEE]);
  console.log(`Transferring ${amount} ${asset} ${from} -> ${to}`);
  await fromWallet.transfer(asset, toWallet, amount);
  console.log('Transfer complete');
};
