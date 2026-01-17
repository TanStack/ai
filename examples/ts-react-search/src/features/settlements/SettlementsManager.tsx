'use client'

import settlementsCollection from './settlementsCollection'
import SettlementsTable from './SettlementsTable'
import useSettlementsQuery from './useSettlementsQuery'
import type { SettlementsSearch } from './types'
import TableSummary from '@/components/TableSummary'

type SettlementsManagerProps = {
  search: SettlementsSearch
}

function SettlementsManager({ search }: SettlementsManagerProps) {
  const { data: settlements } = useSettlementsQuery(search)

  return (
    <>
      <SettlementsTable settlements={settlements} />
      <TableSummary
        totalCount={settlementsCollection.toArray.length}
        resultCount={settlements.length}
      />
    </>
  )
}

export default SettlementsManager
