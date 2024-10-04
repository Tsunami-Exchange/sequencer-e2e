import { Command } from 'commander';
import { transferCommand } from './transfer';
import { balanceCommand } from './balance';
import { newWalletCommand } from './new-wallet';
import { runProfile } from './run-profile';
import { WalletsContainer } from '../utils/wallets';
import { Config } from '../utils/config';
import { supplyCommand } from './supply';
import { checkOrdersCommand } from './check-orders';

const run = async () => {
  await Config.init();
  await WalletsContainer.init();

  const program = new Command();
  program
    .command('transfer')
    .argument('<amount>', 'amount', parseFloat)
    .argument('<asset>', 'asset')
    .argument('<from>', 'from wallet')
    .argument('<to>', 'to wallet')
    .action(transferCommand);

  program.command('run-profile').argument('[profiles...]', 'profiles to run').action(runProfile);

  program.command('balance').argument('[wallets...]', 'wallets').action(balanceCommand);

  program.command('new-wallet').argument('[times]', 'how many wallets', parseInt).action(newWalletCommand);

  program.command('supply').argument('<assets...>', 'required assets to transfer, eg. 1 TON 2000 USDT').action(supplyCommand);

  program.command('check-orders').action(checkOrdersCommand);

  await program.parseAsync(process.argv);
};

run()
  .catch(console.error)
  .then(() => {
    WalletsContainer.close();
    process.exit(0);
  });
