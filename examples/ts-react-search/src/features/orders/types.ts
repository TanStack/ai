import type {
  ORDER_STATUS_MAP,
  PAYMENT_METHOD_MAP,
  ordersSearchSchema,
} from './constants'
import type z from 'zod'

type OrderStatus = (typeof ORDER_STATUS_MAP)[keyof typeof ORDER_STATUS_MAP]
type PaymentMethod =
  (typeof PAYMENT_METHOD_MAP)[keyof typeof PAYMENT_METHOD_MAP]

export type Order = {
  id: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  from: string
  to: string
}

export type OrdersSearch = z.infer<typeof ordersSearchSchema>
