import { Interval, Market } from '@/common/types';
import { gql } from 'graphql-request';

export function ActualCandleQuery() {
  return gql`
    query ActualCandleQuery($interval: String!, $dApp: String!) {
      candle(interval: $interval, dApp: $dApp) {
        tt
        h
        o
        l
        c
        lc
        v
        nv
        __typename
      }
    }
  `;
}

export function ActualCandleQueryVariables(dApp: Market['address'], interval: Interval) {
  return {
    interval,
    dApp,
  };
}
