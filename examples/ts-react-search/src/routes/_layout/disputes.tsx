import { createFileRoute } from '@tanstack/react-router'
import getDisputes from '@/features/disputes/getDisputes'
import DisputesTable from '@/features/disputes/DisputesTable'
import TableSummary from '@/components/TableSummary'
import DisputesFilters from '@/features/disputes/DisputesFilters'
import { disputesSearchSchema } from '@/features/disputes/constants'

export const Route = createFileRoute('/_layout/disputes')({
  component: DisputesPage,
  loader: async ({ location }) => {
    return await getDisputes({ data: { search: location.search } })
  },
  validateSearch: (search) => {
    return disputesSearchSchema.parse(search)
  },
})

function DisputesPage() {
  const { totalCount, disputes } = Route.useLoaderData()
  const search = Route.useSearch()

  return (
    <div className="flex flex-col gap-6 py-6 max-w-7xl mx-auto">
      <DisputesFilters key={JSON.stringify(search)} search={search} />
      <DisputesTable disputes={disputes} />
      <TableSummary totalCount={totalCount} resultCount={disputes.length} />
    </div>
  )
}
