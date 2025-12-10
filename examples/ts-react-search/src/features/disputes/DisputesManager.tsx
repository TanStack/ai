'use client'

import useDisputesQuery from './useDisputesQuery'
import DisputesTable from './DisputesTable'
import disputesCollection from './disputesCollection'
import type { DisputesSearch } from './types'
import TableSummary from '@/components/TableSummary'

type DisputesManagerProps = {
  search: DisputesSearch
}

function DisputesManager({ search }: DisputesManagerProps) {
  const { data: disputes } = useDisputesQuery(search)

  return (
    <>
      <DisputesTable disputes={disputes} />
      <TableSummary
        totalCount={disputesCollection.toArray.length}
        resultCount={disputes.length}
      />
    </>
  )
}

export default DisputesManager
