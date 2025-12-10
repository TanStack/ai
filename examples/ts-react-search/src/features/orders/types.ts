import type {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  orderSchema,
  ordersSearchSchema,
} from './constants'
import type z from 'zod'

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export type Order = z.infer<typeof orderSchema>

export type OrdersSearch = z.infer<typeof ordersSearchSchema>
