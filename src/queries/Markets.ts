import { gql } from 'graphql-request';

export function MarketsQuery() {
  return gql`
    query MarketsQuery {
      markets {
        settings {
          maintenanceMarginRatio
          minInitMarginRatio
          fee
          executionFee
          maxOpenNotional
          rolloverFee
          maxPriceImpact
          maxPriceSpread
          initMarginRatio
          fundingMode
          oracleMode
          positionMode
          isCloseOnly
          isPaused
          __typename
        }
        address
        ...AmmStateFragment
        change {
          initialPrice
          quoteVolume
          baseVolume
          __typename
        }
        incentive {
          twapSpotPrice
          twapIndexPrice
          longFundingRate
          shortFundingRate
          __typename
        }
        config {
          address
          baseAsset
          quoteAsset
          tags
          imageLink
          ticker
          name
          type
          __typename
        }
        prelaunch {
          startTime
          endTime
          closeOnly
          paused
          __typename
        }
        __typename
      }
    }

    fragment AmmStateFragment on TsunamiMarket {
      amm {
        txId
        baseAssetReserve
        quoteAssetReserve
        baseAssetReserveWeight
        quoteAssetReserveWeight
        latestLongPremiumFraction
        latestShortPremiumFraction
        longFundingRate
        shortFundingRate
        openInterestLong
        openInterestShort
        openInterestNotional
        indexPrice
        nextFundingBlock
        blockTimestamp
        totalLongPositionSize
        totalShortPositionSize
        totalPositionSize
        __typename
      }
      incentive {
        twapSpotPrice
        twapIndexPrice
        longFundingRate
        shortFundingRate
        __typename
      }
      __typename
    }
  `;
}
