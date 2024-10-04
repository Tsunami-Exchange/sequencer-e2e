1. npm run profile {profile-name} to run stress test with specific profile (or list of profiles)

to create wallet

2. npm run new-wallet (pass an amount of wallets) wallets.json file has to be created in advance + pass add array to the file

one of the wallets has to have {name: treasury} + money should be deposited there first in advance

3. To transfer assets to specific wallet
   npm run transfer {amount of assets: int} {asset: str} {name of treasury in wallets json} {address or name}

4. Transfer to all wallets from wallets.json use (THIS METHOD DOES NOT WORK)
   npm run supply {amount of asset:decimal} {assetName}

5. to get current balance
   npm run balance {wallet name} (has to be explicitly specified in wallets.json)
