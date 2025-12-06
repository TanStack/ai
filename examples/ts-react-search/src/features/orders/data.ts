import { ORDER_STATUS_MAP, PAYMENT_METHOD_MAP } from './constants'
import type { Order } from './types'

export const ORDERS: Array<Order> = [
  {
    id: 'ord_1001',
    status: ORDER_STATUS_MAP.AUTHORIZED,
    paymentMethod: PAYMENT_METHOD_MAP.CREDIT_CARD,
    from: '2025-01-15T08:30:00Z',
    to: '2025-01-20T10:00:00Z',
  },
  {
    id: 'ord_1002',
    status: ORDER_STATUS_MAP.CAPTURED,
    paymentMethod: PAYMENT_METHOD_MAP.PAYPAL,
    from: '2025-02-12T14:20:00Z',
    to: '2025-02-15T16:00:00Z',
  },
  {
    id: 'ord_1003',
    status: ORDER_STATUS_MAP.PARTIALLY_CAPTURED,
    paymentMethod: PAYMENT_METHOD_MAP.APPLE_PAY,
    from: '2025-03-22T09:15:00Z',
    to: '2025-03-29T18:00:00Z',
  },
  {
    id: 'ord_1004',
    status: ORDER_STATUS_MAP.EXPIRED,
    paymentMethod: PAYMENT_METHOD_MAP.GOOGLE_PAY,
    from: '2025-04-05T16:45:00Z',
    to: '2025-04-12T17:00:00Z',
  },
  {
    id: 'ord_1005',
    status: ORDER_STATUS_MAP.CANCELED,
    paymentMethod: PAYMENT_METHOD_MAP.CREDIT_CARD,
    from: '2025-05-18T11:00:00Z',
    to: '2025-05-25T11:10:00Z',
  },
  {
    id: 'ord_1006',
    status: ORDER_STATUS_MAP.CAPTURED,
    paymentMethod: PAYMENT_METHOD_MAP.PAYPAL,
    from: '2025-06-30T13:30:00Z',
    to: '2025-07-05T15:00:00Z',
  },
  {
    id: 'ord_1007',
    status: ORDER_STATUS_MAP.AUTHORIZED,
    paymentMethod: PAYMENT_METHOD_MAP.APPLE_PAY,
    from: '2025-07-25T10:10:00Z',
    to: '2025-08-01T10:40:00Z',
  },
  {
    id: 'ord_1008',
    status: ORDER_STATUS_MAP.EXPIRED,
    paymentMethod: PAYMENT_METHOD_MAP.GOOGLE_PAY,
    from: '2025-08-08T07:55:00Z',
    to: '2025-08-20T08:00:00Z',
  },
  {
    id: 'ord_1009',
    status: ORDER_STATUS_MAP.PARTIALLY_CAPTURED,
    paymentMethod: PAYMENT_METHOD_MAP.CREDIT_CARD,
    from: '2025-09-14T15:20:00Z',
    to: '2025-09-21T09:00:00Z',
  },
  {
    id: 'ord_1010',
    status: ORDER_STATUS_MAP.CANCELED,
    paymentMethod: PAYMENT_METHOD_MAP.PAYPAL,
    from: '2025-10-02T19:00:00Z',
    to: '2025-10-12T19:05:00Z',
  },
]
