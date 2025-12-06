import { createServerFn } from '@tanstack/react-start'
import { ORDER_STATUS_MAP, PAYMENT_METHOD_MAP } from './constants'
import { ORDERS } from './data'

const TOTAL_COUNT = ORDERS.length

type OrderStatusKey = keyof typeof ORDER_STATUS_MAP
type PaymentMethodKey = keyof typeof PAYMENT_METHOD_MAP

function getOrderStatusValue(key: string) {
  if (key in ORDER_STATUS_MAP) {
    return ORDER_STATUS_MAP[key as OrderStatusKey]
  }

  return null
}

function getPaymentMethodValue(key: string) {
  if (key in PAYMENT_METHOD_MAP) {
    return PAYMENT_METHOD_MAP[key as PaymentMethodKey]
  }

  return null
}

const getOrders = createServerFn({
  method: 'GET',
})
  .inputValidator((data: { search: Record<string, string> }) => data)
  .handler(({ data: { search } }) => {
    const data = {
      totalCount: TOTAL_COUNT,
      orders: ORDERS,
    }

    if (!search.status && !search.paymentMethod && !search.from && !search.to)
      return data

    const filteredOrders = ORDERS.filter((order) => {
      if (
        search.status &&
        order.status !== getOrderStatusValue(search.status)
      ) {
        return false
      }

      if (
        search.paymentMethod &&
        order.paymentMethod !== getPaymentMethodValue(search.paymentMethod)
      ) {
        return false
      }

      if (search.from && new Date(order.from) < new Date(search.from)) {
        return false
      }

      if (search.to && new Date(order.to) > new Date(search.to)) {
        return false
      }

      return true
    })

    return {
      ...data,
      orders: filteredOrders,
    }
  })

export default getOrders
