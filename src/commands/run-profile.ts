import { isAxiosError } from 'axios';
import { parseProfiles } from '../utils/parse-profiles';
import { ProfileExecutor } from '../utils/profile-executor';

export const runProfile = async (profileNames: string[]) => {
  try {
    const parsedProfiles = await parseProfiles(profileNames);
    const executor = new ProfileExecutor();
    for (const [name, profile] of Object.entries(parsedProfiles)) {
      if (profileNames.length === 0 || profileNames.includes(name)) {
        console.log(`Executing profile ${name}`);
        for (const participant of profile.participants) {
          console.log('');
          console.log(`===== Wallet ${participant.name} (${participant.getTonAddress().toString()}) will execute following actions: =====`);
          console.log('');
          let idx = 0;
          for (const action of profile.actions) {
            for (const market of action.markets) {
              idx++;
              switch (action.type) {
                case 'market_close':
                  console.log(`${idx}) [${action.direction.toUpperCase()}] close position on market ${market.ticker}, amount: ${action.amount}`);
                  break;
                case 'market_open':
                  console.log(
                    `${idx}) [${action.direction.toUpperCase()}] open position on market ${market.ticker}, amount: ${action.amount} ${market.settlementToken}, leverage: ${action.leverage}, sl: ${action.sl}, tp: ${action.tp}`
                  );
                  break;
                case 'limit':
                  console.log(
                    `${idx}) [${action.direction.toUpperCase()}] create limit order on market ${market.ticker}, amount: ${action.amount}, stop price ${action.stopPrice}`
                  );
                  break;
                case 'cancel':
                  console.log(
                    `${idx}) [${action.direction.toUpperCase()}] cancel ${action.orderType} order on market ${market.ticker}, index ${action.orderIndex}`
                  );
                  break;
              }
            }
          }
        }
        console.log('');
        await executor.execute(profile);
        console.log(`Profile ${name} finished`);
      }
    }
  } catch (e) {
    if (e instanceof Error) {
      if (isAxiosError(e)) {
        throw new Error(`Request to ${e.config?.url} failed with error: ${e.message}`);
      }
    }
    throw e;
  }
};
