import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import OrdersFilters from '@/features/orders/OrdersFilters'
import { ordersSearchSchema } from '@/features/orders/constants'
import ordersCollection from '@/features/orders/ordersCollection'
import OrdersManager from '@/features/orders/OrdersManager'
import Spinner from '@/components/Spinner'

export const Route = createFileRoute('/_layout/orders')({
  component: OrdersPage,
  loader: async () => {
    await ordersCollection.preload()
    return null
  },
  validateSearch: zodValidator(ordersSearchSchema),
})

function OrdersPage() {
  const search = Route.useSearch()

  return (
    <div className="flex flex-col gap-6 py-6 max-w-7xl mx-auto">
      <OrdersFilters key={JSON.stringify(search)} search={search} />
      <ClientOnly fallback={<Spinner />}>
        <OrdersManager search={search} />
      </ClientOnly>
    </div>
  )
}
