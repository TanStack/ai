import { createFileRoute } from '@tanstack/react-router'
import getOrders from '@/features/orders/getOrders'
import OrdersTable from '@/features/orders/OrdersTable'
import TableSummary from '@/components/TableSummary'
import OrdersFilters from '@/features/orders/OrdersFilters'
import { ordersSearchSchema } from '@/features/orders/constants'

export const Route = createFileRoute('/_layout/orders')({
  component: OrdersPage,
  loader: async ({ location }) => {
    return await getOrders({ data: { search: location.search } })
  },
  validateSearch: (search) => {
    return ordersSearchSchema.parse(search)
  },
})

function OrdersPage() {
  const { totalCount, orders } = Route.useLoaderData()
  const search = Route.useSearch()

  return (
    <div className="flex flex-col gap-6 py-6 max-w-7xl mx-auto">
      <OrdersFilters key={JSON.stringify(search)} search={search} />
      <OrdersTable orders={orders} />
      <TableSummary totalCount={totalCount} resultCount={orders.length} />
    </div>
  )
}
