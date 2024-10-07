import { gql } from 'graphql-request';
import { Market, Trader } from '@common/types';
import { Address } from '@ton/core';

export function ActivePositionsQuery() {
  return gql`
    query GetActivePositions($trader: String!, $market: String!) {
      getActivePositions(trader: $trader, market: $market) {
        short {
          idx
          txId
          version
          openedAt
          lastUpdatedAt
          closedAt
          status
          market
          trader
          size
          notional
          fraction
          margin
          pnl
          funding
          rolloverFee
          direction
          timestamp
          feeRate
          settlementOraclePrice
          executionFeeRate
          __typename
        }
        long {
          idx
          txId
          version
          openedAt
          lastUpdatedAt
          closedAt
          status
          market
          trader
          size
          notional
          fraction
          margin
          pnl
          funding
          rolloverFee
          direction
          timestamp
          feeRate
          settlementOraclePrice
          executionFeeRate
          __typename
        }
        orders {
          id
          txId
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

export function ActivePositionsVariables(trader: Trader | Address, marketAddress: Market['address']) {
  return { trader, market: marketAddress };
}
