import { Address } from '@ton/ton';

export const toAddress = (address: Address | string): Address => {
  return typeof address === 'string' ? Address.parse(address) : address;
};
