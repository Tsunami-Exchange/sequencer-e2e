import { WalletsContainer } from '../utils/wallets';
import { formatWallet } from '../utils/format-wallet';

export const balanceCommand = async (walletsFilter: string[]) => {
  const wallets = WalletsContainer.getWallets();
  await Promise.all(
    Object.entries(wallets).map(async ([name, wallet]) => {
      if (walletsFilter.length === 0 || walletsFilter.includes(name)) {
        const balances = await wallet.getAllBalances();
        console.log(`=== ${formatWallet(wallet)} ====`);
        Object.entries(balances).forEach(([name, balance]) => {
          console.log(name, balance);
        });
      }
    })
  );
};
