import { z } from 'zod'
import { fallback } from '@tanstack/zod-adapter'
import type { DisputeReason, DisputeStatus } from './types'

export const DISPUTE_STATUSES = [
  'LOST',
  'RESPONSE_REQUIRED',
  'UNDER_REVIEW',
  'WON',
] as const

export const DISPUTE_STATUS_MAP: Record<DisputeStatus, string> = {
  LOST: 'Lost',
  RESPONSE_REQUIRED: 'Response required',
  UNDER_REVIEW: 'Under review',
  WON: 'Won',
}

export const DISPUTE_REASONS = [
  'FAULTY_GOODS',
  'GOODS_NOT_RECEIVED',
  'HIGH_RISK_ORDER',
  'INCORRECT_INVOICE',
  'RETURN',
  'UNAUTHORIZED_PURCHASE',
] as const

export const DISPUTE_REASON_MAP: Record<DisputeReason, string> = {
  FAULTY_GOODS: 'Faulty goods',
  GOODS_NOT_RECEIVED: 'Goods not received',
  HIGH_RISK_ORDER: 'High risk order',
  INCORRECT_INVOICE: 'Incorrect invoice',
  RETURN: 'Return',
  UNAUTHORIZED_PURCHASE: 'Unauthorized purchase',
}

export const disputeSchema = z.object({
  id: z.string(),
  status: z.enum(DISPUTE_STATUSES),
  reason: z.enum(DISPUTE_REASONS),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
})

export const disputesSearchSchema = z.object({
  status: fallback(z.enum(DISPUTE_STATUSES).optional(), undefined),
  reason: fallback(z.enum(DISPUTE_REASONS).optional(), undefined),
  from: fallback(z.string().optional(), undefined),
  to: fallback(z.string().optional(), undefined),
})
