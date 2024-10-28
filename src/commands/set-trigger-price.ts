import { Market } from '@/utils/config';
import { FAKE_ORCALE_API_URL } from '../utils/constants';

export const setTriggerPriceCommand = async (asset: Market['baseAsset'], price: number) => {
  const response = await fetch(`${FAKE_ORCALE_API_URL}/price`, {
    method: 'POST',
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
