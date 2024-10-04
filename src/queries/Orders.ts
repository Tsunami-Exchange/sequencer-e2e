import { Direction } from '@/common/types';
import { gql } from 'graphql-request';
import { OrderStatus, Market, Trader } from '../common/types';

export function OrdersQuery() {
  return gql`
    query Orders($trader: String!, $market: String, $direction: OrderDirection, $statuses: [OrderStatus!], $limit: Float) {
      orders(trader: $trader, market: $market, direction: $direction, statuses: $statuses, limit: $limit) {
        totalCount
        data {
          txId
          id
          type
          direction
          amount
          trader
          createdAt
          trader
          market
          status
          stopPrice
          limitPrice
          stopTriggerPrice
          takeTriggerPrice
          leverage
          index
          positionId
          expiration
          amount
          indexPrice
          settlementOraclePrice
          error
          __typename
        }
        __typename
      }
    }
  `;
}

export function OrdersQueryVariables({
  trader,
  market,
  direction,
  statuses,
  limit,
}: {
  trader: Trader;
  market: Market['address'];
  direction?: Direction;
  statuses: OrderStatus[];
  limit: number;
}) {
  return {
    trader,
    market,
    direction,
    statuses,
    limit,
  };
}
