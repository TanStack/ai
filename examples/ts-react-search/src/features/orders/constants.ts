import { z } from 'zod'
import { fallback } from '@tanstack/zod-adapter'
import type { OrderStatus, PaymentMethod } from './types'

export const ORDER_STATUSES = [
  'AUTHORIZED',
  'CANCELED',
  'CAPTURED',
  'EXPIRED',
  'PARTIALLY_CAPTURED',
] as const

export const ORDER_STATUS_MAP: Record<OrderStatus, string> = {
  AUTHORIZED: 'Authorized',
  CANCELED: 'Canceled',
  CAPTURED: 'Captured',
  EXPIRED: 'Expired',
  PARTIALLY_CAPTURED: 'Partially captured',
}

export const PAYMENT_METHODS = [
  'CREDIT_CARD',
  'PAYPAL',
  'APPLE_PAY',
  'GOOGLE_PAY',
] as const

export const PAYMENT_METHOD_MAP: Record<PaymentMethod, string> = {
  CREDIT_CARD: 'Credit card',
  PAYPAL: 'PayPal',
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
}

export const orderSchema = z.object({
  id: z.string(),
  status: z.enum(ORDER_STATUSES),
  paymentMethod: z.enum(PAYMENT_METHODS),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
})

export const ordersSearchSchema = z.object({
  status: fallback(z.enum(ORDER_STATUSES).optional(), undefined),
  paymentMethod: fallback(z.enum(PAYMENT_METHODS).optional(), undefined),
  from: fallback(z.string().optional(), undefined),
  to: fallback(z.string().optional(), undefined),
})
