import { and, eq, gte, lte, useLiveQuery } from '@tanstack/react-db'
import ordersCollection from './ordersCollection'
import type { OrdersSearch } from './types'

function useOrdersQuery(search: OrdersSearch) {
  return useLiveQuery(
    (query) =>
      query
        .from({ order: ordersCollection })
        .where(({ order }) =>
          and(
            eq(order.status, search.status ?? order.status),
            eq(
              order.paymentMethod,
              search.paymentMethod ?? order.paymentMethod,
            ),
            gte(order.from, search.from ?? order.from),
            lte(order.to, search.to ?? order.to),
          ),
        ),
    [search.paymentMethod, search.status, search.from, search.to],
  )
}

export default useOrdersQuery
