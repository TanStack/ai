import { z } from 'zod'

export const ORDER_STATUS_MAP = {
  AUTHORIZED: 'Authorized',
  CANCELED: 'Canceled',
  CAPTURED: 'Captured',
  EXPIRED: 'Expired',
  PARTIALLY_CAPTURED: 'Partially captured',
} as const

export const PAYMENT_METHOD_MAP = {
  CREDIT_CARD: 'Credit card',
  PAYPAL: 'PayPal',
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
} as const

export const ordersSearchSchema = z.object({
  status: z.enum(Object.keys(ORDER_STATUS_MAP)).optional(),
  paymentMethod: z.enum(Object.keys(PAYMENT_METHOD_MAP)).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})
