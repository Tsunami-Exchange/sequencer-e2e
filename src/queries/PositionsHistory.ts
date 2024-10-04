import { Market } from '@/common/types';
import { gql } from 'graphql-request';

export function PositionsHistoryQuery() {
  return gql`
    query GetPositionsHistory($trader: String!, $market: String, $statuses: [TraderPositionStatus!]) {
      getPositionsHistory(trader: $trader, market: $market, statuses: $statuses) {
        order {
          id
          trader
          market
          status
          type
          direction
          stopPrice
          limitPrice
          stopTriggerPrice
          takeTriggerPrice
          leverage
          index
          positionId
          expiration
          amount
          createdAt
          __typename
        }
        trader
        market
        version
        idx
        status
        closedAt
        lastUpdatedAt
        pnl
        executionFeeInEvent
        funding
        openedAt
        size
        timestamp
        feeRate
        notional
        fraction
        margin
        exchangedQuote
        exchangedBase
        rolloverFee
        fee
        executionFee
        settlementOraclePrice
        direction
        __typename
      }
    }
  `;
}

export function PositionsHistoryQueryVariables(trader: string, marketAddress: Market['address']) {
  return { trader, market: marketAddress };
}
