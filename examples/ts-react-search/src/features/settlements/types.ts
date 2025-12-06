import type {
  SETTLEMENT_CURRENCY_MAP,
  settlementsSearchSchema,
} from './constants'
import type z from 'zod'

type SettlementCurrency =
  (typeof SETTLEMENT_CURRENCY_MAP)[keyof typeof SETTLEMENT_CURRENCY_MAP]

export type Settlement = {
  id: string
  currency: SettlementCurrency
  from: string
  to: string
}

export type SettlementsSearch = z.infer<typeof settlementsSearchSchema>
