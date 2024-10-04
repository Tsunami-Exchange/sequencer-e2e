import { Wallet } from './wallet';

export const requireCommissions = async (wallet: Wallet, commissions: bigint[] = []) => {
  if (commissions.length === 0) {
    return;
  }
  const totalCommissions = commissions.reduce((acc, i) => acc + i, 0n);
  const balance = await wallet.getTonBalance();
  if (totalCommissions > balance) {
    throw new Error(`Insufficient balance. Balance = ${balance} TON, required for commissions = ${totalCommissions} TON`);
  }
};

export const requireBalance = async (wallet: Wallet, asset: string, amount: number, commissions: bigint[] = []) => {
  await requireCommissions(wallet, commissions);
  const balance = await wallet.getBalance(asset);
  if (amount > balance) {
    throw new Error(`Insufficient balance. Balance = ${balance} ${asset}, required = ${amount} ${asset}`);
  }
};
