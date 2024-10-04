import { z } from 'zod';

const hexAssetSchema = z.lazy(() => {
  if (process.env.ENVIRONMENT === 'dev') {
    return z
      .string()
      .regex(/^0:[a-f0-9]{64}$/)
      .optional();
  } else {
    return z.string().regex(/^0:[a-f0-9]{64}$/);
  }
});

export const DirectionValidator = z.enum(['LONG', 'SHORT']);
export const OrderStatus = z.enum(['SEQ_PENDING', 'SEQ_EXECUTING', 'ACTIVE', 'PENDING', 'TX_SENT', 'EXECUTED', 'CANCELED', 'EXPIRED', 'ERROR']);

export const JettonMasterObjectValidator = z
  .object({
    USDT: z.string().regex(/^0:[a-f0-9]{64}$/),
  })
  .extend({
    jUSDT: hexAssetSchema,
    NOT: hexAssetSchema,
  });

export const JettonEnums = z
  .enum(['NOT', 'USDT', 'jUSDT'])
  .refine((value) => (__ENV.ENVIRONMENT === 'dev' ? !['NOT', 'jUSDT'].includes(value) : true), {
    message: 'Invalid jetton enum, only USDT is available in dev env',
  });
export const ServerMarketsValidator = z.array(
  z.object({
    config: z.object({
      ticker: z.string(),
      name: z.string(),
    }),
    address: z.string().regex(/^0:[a-f0-9]{64}$/),
  })
);

export const PlatformEnvironmentValidator = z.object({
  TRADERS: z.array(z.string()),
  VITE_WS_URL: z.string(),
  VITE_BASE_URL: z.string(),
  VITE_API_URL: z.string(),
  VITE_URL_ORACLE: z.string(),
  VITE_ANTON_URL: z.string(),
  VITE_TG_BOT_URL: z.string(),
  VITE_URL_DOCS: z.string(),
  VITE_TG_BOT_API: z.string(),
  JETTONS_MASTER: JettonMasterObjectValidator,
});

export const AcademyEnvironmentValidator = z.object({
  ACADEMY: z.string().url(),
});

export const CandleValidator = z.object({
  tt: z.string(),
  h: z.number(),
  o: z.number(),
  l: z.number(),
  c: z.number(),
  lc: z.null(),
  v: z.string(),
  nv: z.string(),
  __typename: z.literal('OHLC'),
});

export const DataFeedCandleValidator = z.object({
  o: z.array(z.number()),
  h: z.array(z.number()),
  l: z.array(z.number()),
  c: z.array(z.number()),
  v: z.array(z.number()),
  t: z.array(z.number()),
  s: z.literal('ok'),
});

export const BalanceValidator = z.object({
  balance: z.number(),
  is_active: z.boolean().optional(),
});

const ActivePositionValidator = z.object({
  idx: z.string().nullable(),
  txId: z.string().nullable(),
  version: z.number(),
  openedAt: z.string(),
  lastUpdatedAt: z.string(),
  closedAt: z.string().nullable().optional(),
  status: z.string(),
  market: z.string(),
  trader: z.string(),
  size: z.string(),
  notional: z.string(),
  fraction: z.string(),
  margin: z.string(),
  pnl: z.string(),
  funding: z.string(),
  rolloverFee: z.string(),
  direction: z.string(),
  timestamp: z.string(),
  feeRate: z.string(),
  settlementOraclePrice: z.string(),
  executionFeeRate: z.string(),
  __typename: z.literal('PositionResponse'), // Update to match actual type
});

export const ArrayOfOrderSchemaValidator = z.array(
  z.object({
    id: z.string().nullable(),
    txId: z.string().nullable(),
    trader: z.string(),
    market: z.string(),
    status: z.string(),
    type: z.string(),
    direction: z.string(),
    stopPrice: z.string(),
    limitPrice: z.string(),
    stopTriggerPrice: z.string(),
    takeTriggerPrice: z.string(),
    leverage: z.string().nullable(),
    index: z.string(),
    positionId: z.string().nullable(),
    expiration: z.string().nullable(),
    amount: z.string(),
    createdAt: z.string(),
    indexPrice: z.string(),
    settlementOraclePrice: z.string(),
    error: z.string().nullable().optional(),
    __typename: z.literal('OrderResponse'),
  })
);

export const ActivePositionsValidator = z.object({
  short: ActivePositionValidator.nullable(),
  long: ActivePositionValidator.nullable(),
  orders: ArrayOfOrderSchemaValidator.nullable(),
  __typename: z.literal('TraderPositionsResponse'),
});

export const PaginatedOrdersValidator = z.object({
  totalCount: z.number(),
  data: ArrayOfOrderSchemaValidator.nullable(),
  __typename: z.literal('PaginatedOrderResponse'),
});

export const CandleSchemaValidator = z.object({
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  min_timestamp: z.number().int(),
});

const OrderSchema = z.object({
  id: z.string(),
  limitPrice: z.string(),
  status: z.string(),
  type: z.string(),
  takeTriggerPrice: z.string(),
  positionId: z.string(),
  createdAt: z.string().datetime(),
  trader: z.string(),
  direction: z.string(),
  stopPrice: z.string(),
  stopTriggerPrice: z.string(),
  leverage: z.string().nullable(),
  market: z.string(),
  index: z.string(),
  expiration: z.nullable(z.string()),
  amount: z.string(),
  __typename: z.string(),
});

const TraderPositionWithOrderResponseSchema = z.object({
  exchangedQuote: z.string(),
  market: z.string(),
  version: z.number(),
  status: z.string(),
  closedAt: z.string().nullable(),
  lastUpdatedAt: z.string().datetime(),
  funding: z.string(),
  feeRate: z.string(),
  exchangedBase: z.string(),
  order: OrderSchema.nullable(),
  trader: z.string(),
  executionFeeInEvent: z.string(),
  openedAt: z.string().datetime(),
  timestamp: z.string().datetime(),
  direction: z.string(),
  __typename: z.string(),
  notional: z.string(),
  fee: z.string(),
  settlementOraclePrice: z.string(),
  idx: z.string(),
  pnl: z.string(),
  size: z.string(),
  fraction: z.string(),
  margin: z.string(),
  rolloverFee: z.string(),
  executionFee: z.string(),
});

export const GetPositionsHistoryValidator = z.array(TraderPositionWithOrderResponseSchema.optional());

export const IntervalValidator = z.enum(['1min', '5min', '15min', '30min', '1hour', '4hour', '1day']);
export const ResolutionValidator = z.enum(['1', '5', '15', '30', '60', '240', '1D']);
export const CountBackValidator = z.number().int().min(0).max(500);

const AmmStateFragmentSchema = z.object({
  amm: z.object({
    txId: z.string(),
    baseAssetReserve: z.string(),
    quoteAssetReserve: z.string(),
    baseAssetReserveWeight: z.string(),
    quoteAssetReserveWeight: z.string(),
    latestLongPremiumFraction: z.string(),
    latestShortPremiumFraction: z.string(),
    longFundingRate: z.string(),
    shortFundingRate: z.string(),
    openInterestLong: z.string(),
    openInterestShort: z.string(),
    openInterestNotional: z.string(),
    indexPrice: z.string(),
    nextFundingBlock: z.string(),
    blockTimestamp: z.string(),
    totalLongPositionSize: z.string(),
    totalShortPositionSize: z.string(),
    totalPositionSize: z.string(),
    __typename: z.literal('AmmState'),
  }),
  incentive: z.object({
    twapSpotPrice: z.string(),
    twapIndexPrice: z.string(),
    longFundingRate: z.string(),
    shortFundingRate: z.string(),
    __typename: z.literal('FundingRate'),
  }),
  __typename: z.literal('TsunamiMarket'),
});

export const AmmWSMessageSchema = z.object({
  txId: z.array(z.string()), // Array of strings for transaction IDs
  amm: z.array(z.string()), // Array of strings for AMM addresses
  quoteAssetReserve: z.array(z.string()), // Array of strings for quote asset reserves
  quoteAssetReserveWeight: z.array(z.string()), // Array of strings for quote asset reserve weights
  baseAssetReserve: z.array(z.string()), // Array of strings for base asset reserves
  baseAssetReserveWeight: z.array(z.string()), // Array of strings for base asset reserve weights
  openInterestLong: z.array(z.string()), // Array of strings for open interest long positions
  openInterestShort: z.array(z.string()), // Array of strings for open interest short positions
  nextFundingBlock: z.array(z.number()), // Array of numbers for next funding block timestamps
  indexPrice: z.array(z.string()), // Array of strings for index prices
  twapIndexPrice: z.array(z.string()), // Array of strings for TWAP index prices
  twapSpotPrice: z.array(z.string()), // Array of strings for TWAP spot prices
  longFundingRate: z.array(z.string()), // Array of strings for long funding rates
  shortFundingRate: z.array(z.string()), // Array of strings for short funding rates
  timestamp: z.array(z.number()), // Array of numbers for timestamps
});

// Main MarketsQuery Schema
export const MarketsQueryValidator = z.object({
  markets: z.array(
    z
      .object({
        settings: z.object({
          maintenanceMarginRatio: z.string(),
          minInitMarginRatio: z.string(),
          fee: z.string(),
          executionFee: z.string(),
          maxOpenNotional: z.string(),
          rolloverFee: z.string(),
          maxPriceImpact: z.string(),
          maxPriceSpread: z.string(),
          initMarginRatio: z.string(),
          fundingMode: z.number(),
          oracleMode: z.number(),
          positionMode: z.number(),
          isCloseOnly: z.boolean(),
          isPaused: z.boolean(),
          __typename: z.literal('AmmSettings'),
        }),
        address: z.string(),
        change: z.object({
          initialPrice: z.string(),
          quoteVolume: z.string(),
          baseVolume: z.string(),
          __typename: z.literal('DailyChange'),
        }),
        incentive: z.object({
          twapSpotPrice: z.string(),
          twapIndexPrice: z.string(),
          longFundingRate: z.string(),
          shortFundingRate: z.string(),
          __typename: z.literal('FundingRate'),
        }),
        config: z.object({
          address: z.string(),
          baseAsset: z.string(),
          quoteAsset: z.string(),
          tags: z.array(z.string()),
          imageLink: z.string().optional(),
          ticker: z.string(),
          name: z.string(),
          type: z.string(),
          __typename: z.literal('MarketConfig'),
        }),
        prelaunch: z.nullable(
          z.object({
            startTime: z.string().nullable(),
            endTime: z.string().nullable(),
            closeOnly: z.boolean().nullable(),
            paused: z.boolean().nullable(),
            __typename: z.literal('Prelaunch'),
          })
        ),
        __typename: z.literal('TsunamiMarket'),
      })
      .merge(AmmStateFragmentSchema)
  ),
});

const AssetSchema = z.object({
  name: z.string(),
  decimals: z.number(),
  assetId: z.string(),
});

const MarketSchema = z.object({
  address: z.string(),
  quoteAsset: z.string(),
  baseAsset: z.string(),
  imageLink: z.string().url(),
  name: z.string(),
  tags: z.array(z.string()),
  ticker: z.string(),
  quoteAssetId: z.string(),
  coordinator: z.string(),
  settlementToken: z.string(),
  type: z.string(),
  vaultAddress: z.string(),
});

const LiquiditySourceSchema = z.object({
  asset: AssetSchema,
  futures: z.boolean(),
  spot: z.boolean(),
  coordinator: z.string(),
  vaultAddress: z.string(),
  quoteAssetId: z.string(),
  lpJettonMaster: z.string(),
});

export const ApiConfigSchemaValidator = z.object({
  referralCollectionAddress: z.string(),
  genesisCollectionAddress: z.string(),
  assets: z.array(AssetSchema),
  openedMarkets: z.array(MarketSchema),
  liquiditySources: z.array(LiquiditySourceSchema),
  preIcoAddress: z.string().optional(),
  claimByRpAddress: z.string().optional(),
});
