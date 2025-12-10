import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import z from 'zod'
import { orderSchema } from './constants'
import queryClient from '@/queryClient'
import getBaseUrl from '@/utils/getBaseUrl'

const ordersCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['orders'],
    queryFn: async () => {
      const response = await fetch(`${getBaseUrl()}/api/orders`)
      const data = await response.json()

      return z.array(orderSchema).parse(data)
    },
    queryClient,
    getKey: (item) => item.id,
  }),
)

export default ordersCollection
