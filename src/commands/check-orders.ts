import { WalletsContainer } from '../utils/wallets';
import { SdkManager } from '../utils/sdk-manager';
import { Config } from '../utils/config';
import { TonLiteClient } from '../utils/lite-client';
import chunk from 'lodash.chunk';
import { formatWallet } from '../utils/format-wallet';

export const checkOrdersCommand = async () => {
  const wallets = Object.values(WalletsContainer.getWallets()).filter((wallet) => wallet.name !== 'treasury');
  await Config.init();
  const client = await TonLiteClient.init();
  await SdkManager.init(client);
  const config = Config.config();
  const chunks = chunk(wallets, 100);
  const markets = config.openedMarkets.filter((m) => m.baseAsset === 'BNB');
  for (const chunk of chunks) {
    await Promise.all(
      chunk.flatMap((wallet) => {
        return markets.map(async (market) => {
          if (market.type === 'prelaunch') {
            return;
          }
          const position = await SdkManager.getPosition(market.vaultAddress, wallet.getTonAddress(), market.baseAsset);
          if (!position) {
            return;
          }
          if (position.limitOrders.size > 0) {
            console.log(`Wallet ${formatWallet(wallet)} has limit orders at indexes`, Array.from(position.limitOrders.keys()));
          }
          if (position.shortPosition) {
            if (position.shortPosition.positionOrders.size > 0) {
              console.log(
                `Wallet ${formatWallet(wallet)} has sltp short orders at indexes`,
                Array.from(position.shortPosition.positionOrders.keys())
              );
            }
          }
          if (position.longPosition) {
            if (position.longPosition.positionOrders.size > 0) {
              console.log(`Wallet has ${formatWallet(wallet)} sltp long orders at indexes`, Array.from(position.longPosition.positionOrders.keys()));
            }
          }
        });
      })
    );
  }
};
