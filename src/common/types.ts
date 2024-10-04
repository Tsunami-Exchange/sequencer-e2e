import {
  PlatformEnvironmentValidator,
  IntervalValidator,
  JettonMasterObjectValidator,
  AcademyEnvironmentValidator,
  ServerMarketsValidator,
  DirectionValidator,
  OrderStatus,
} from './safeTypes';
import { z } from 'zod';

export type PlatformEnvironment = z.infer<typeof PlatformEnvironmentValidator>;
export type AcademyEnvironment = z.infer<typeof AcademyEnvironmentValidator>;

export type Markets = z.infer<typeof ServerMarketsValidator>;
export type Market = Markets[number];
export type Trader = PlatformEnvironment['TRADERS'][number];
export type Interval = z.infer<typeof IntervalValidator>;
export type JettonMaster = z.infer<typeof JettonMasterObjectValidator>;
export type Jetton = keyof JettonMaster;
export type Direction = z.infer<typeof DirectionValidator>;
export type OrderStatus = z.infer<typeof OrderStatus>;
