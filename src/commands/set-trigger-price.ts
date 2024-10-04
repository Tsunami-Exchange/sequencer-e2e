import { ORACLE_URL } from '../utils/constants';

export const setTriggerPriceCommand = async (asset: string, price: number) => {
  const response = await fetch(`${ORACLE_URL}/oracle-adapter/fake/price`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      asset,
      price,
    }),
  });
  if (!response.ok) {
    console.error(`Failed to update trigger price. Status: ${response.status}`);
  }
};
