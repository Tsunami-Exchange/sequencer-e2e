import { expect } from 'playwright/test';
import { ORACLE_URL } from './constants';
import { Market } from './config';

export const getLastPrice = async (baseAsset: Market['baseAsset']): Promise<number> => {
  const response = await fetch(`${ORACLE_URL}/feed/${baseAsset}/last`, {
    method: 'GET',
  });
  const data = (await response.json()) as { price: number };
  if (!response.ok && !data.price) {
    throw new Error(`Failed to get last price for ${baseAsset}`);
  }
  expect(data.price).toBeDefined();
  expect(data.price).toBeGreaterThanOrEqual(0);

  return data.price;
};
