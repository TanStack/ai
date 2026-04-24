import { and, eq, gte, lte, useLiveQuery } from '@tanstack/react-db'
import settlementsCollection from './settlementsCollection'
import type { SettlementsSearch } from './types'

function useSettlementsQuery(search: SettlementsSearch) {
  return useLiveQuery(
    (query) =>
      query
        .from({ settlement: settlementsCollection })
        .where(({ settlement }) =>
          and(
            eq(settlement.currency, search.currency ?? settlement.currency),
            gte(settlement.from, search.from ?? settlement.from),
            lte(settlement.to, search.to ?? settlement.to),
          ),
        ),
    [search.currency, search.from, search.to],
  )
}

export default useSettlementsQuery
