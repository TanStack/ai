import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import z from 'zod'
import { disputeSchema } from './constants'
import queryClient from '@/queryClient'
import getBaseUrl from '@/utils/getBaseUrl'

const disputesCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['disputes'],
    queryFn: async () => {
      const response = await fetch(`${getBaseUrl()}/api/disputes`)
      const data = await response.json()

      return z.array(disputeSchema).parse(data)
    },
    queryClient,
    getKey: (item) => item.id,
  }),
)

export default disputesCollection
