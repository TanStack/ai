'use client'

import ordersCollection from './ordersCollection'
import OrdersTable from './OrdersTable'
import useOrdersQuery from './useOrdersQuery'
import type { OrdersSearch } from './types'
import TableSummary from '@/components/TableSummary'

type OrdersManagerProps = {
  search: OrdersSearch
}

function OrdersManager({ search }: OrdersManagerProps) {
  const { data: orders } = useOrdersQuery(search)

  return (
    <>
      <OrdersTable orders={orders} />
      <TableSummary
        totalCount={ordersCollection.toArray.length}
        resultCount={orders.length}
      />
    </>
  )
}

export default OrdersManager
