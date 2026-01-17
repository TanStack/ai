import { z } from 'zod'
import { fallback } from '@tanstack/zod-adapter'
import type { SettlementCurrency } from './types'

export const SETTLEMENT_CURRENCIES = [
  'DKK',
  'EUR',
  'GBP',
  'NOK',
  'PLN',
  'SEK',
  'USD',
] as const

export const SETTLEMENT_CURRENCY_MAP: Record<SettlementCurrency, string> = {
  DKK: 'DKK',
  EUR: 'EUR',
  GBP: 'GBP',
  NOK: 'NOK',
  PLN: 'PLN',
  SEK: 'SEK',
  USD: 'USD',
}

export const settlementSchema = z.object({
  id: z.string(),
  currency: z.enum(SETTLEMENT_CURRENCIES),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
})

export const settlementsSearchSchema = z.object({
  currency: fallback(z.enum(SETTLEMENT_CURRENCIES).optional(), undefined),
  from: fallback(z.string().optional(), undefined),
  to: fallback(z.string().optional(), undefined),
})
