import { z } from 'zod'

export const SETTLEMENT_CURRENCY_MAP = {
  DKK: 'DKK',
  EUR: 'EUR',
  GBP: 'GBP',
  NOK: 'NOK',
  PLN: 'PLN',
  SEK: 'SEK',
  USD: 'USD',
} as const

export const settlementsSearchSchema = z.object({
  currency: z.enum(Object.keys(SETTLEMENT_CURRENCY_MAP)).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})
