import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import z from 'zod'
import { settlementSchema } from './constants'
import queryClient from '@/queryClient'
import getBaseUrl from '@/utils/getBaseUrl'

const settlementsCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['settlements'],
    queryFn: async () => {
      const response = await fetch(`${getBaseUrl()}/api/settlements`)
      const data = await response.json()

      return z.array(settlementSchema).parse(data)
    },
    queryClient,
    getKey: (item) => item.id,
  }),
)

export default settlementsCollection
