import { and, eq, gte, lte, useLiveQuery } from '@tanstack/react-db'
import disputesCollection from './disputesCollection'
import type { DisputesSearch } from './types'

function useDisputesQuery(search: DisputesSearch) {
  return useLiveQuery(
    (query) =>
      query
        .from({ dispute: disputesCollection })
        .where(({ dispute }) =>
          and(
            eq(dispute.status, search.status ?? dispute.status),
            eq(dispute.reason, search.reason ?? dispute.reason),
            gte(dispute.from, search.from ?? dispute.from),
            lte(dispute.to, search.to ?? dispute.to),
          ),
        ),
    [search.reason, search.status, search.from, search.to],
  )
}

export default useDisputesQuery
