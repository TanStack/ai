import { z } from 'zod'

export const DISPUTE_STATUS_MAP = {
  LOST: 'Lost',
  RESPONSE_REQUIRED: 'Response required',
  UNDER_REVIEW: 'Under review',
  WON: 'Won',
} as const

export const DISPUTE_REASON_MAP = {
  FAULTY_GOODS: 'Faulty goods',
  GOODS_NOT_RECEIVED: 'Goods not received',
  HIGH_RISK_ORDER: 'High risk order',
  INCORRECT_INVOICE: 'Incorrect invoice',
  RETURN: 'Return',
  UNAUTHORIZED_PURCHASE: 'Unauthorized purchase',
} as const

export const disputesSearchSchema = z.object({
  status: z.enum(Object.keys(DISPUTE_STATUS_MAP)).optional(),
  reason: z.enum(Object.keys(DISPUTE_REASON_MAP)).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})
