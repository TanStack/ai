import type {
  SETTLEMENT_CURRENCIES,
  settlementSchema,
  settlementsSearchSchema,
} from './constants'
import type z from 'zod'

export type SettlementCurrency = (typeof SETTLEMENT_CURRENCIES)[number]

export type Settlement = z.infer<typeof settlementSchema>

export type SettlementsSearch = z.infer<typeof settlementsSearchSchema>
