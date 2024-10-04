import { mnemonicNew } from '@ton/crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const newWalletCommand = async (amount = 1) => {
  const wallets = fs.readFileSync(path.resolve(__dirname, '../../wallets.json'), 'utf8');
  const decoded = JSON.parse(wallets);
  for (let i = 0; i < amount; i++) {
    const seed = await mnemonicNew();
    decoded.push({
      seed: seed.join(' '),
    });
    console.log(`Written new wallet wallet${decoded.length - 1} with seed ${seed}`);
  }
  fs.writeFileSync(path.resolve(__dirname, '../../wallets.json'), JSON.stringify(decoded, null, 2));
};
