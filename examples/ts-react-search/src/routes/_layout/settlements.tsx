import { createFileRoute } from '@tanstack/react-router'
import getSettlements from '@/features/settlements/getSettlements'
import SettlementsTable from '@/features/settlements/SettlementsTable'
import TableSummary from '@/components/TableSummary'
import SettlementsFilters from '@/features/settlements/SettlementsFilters'
import { settlementsSearchSchema } from '@/features/settlements/constants'

export const Route = createFileRoute('/_layout/settlements')({
  component: SettlementsPage,
  loader: async ({ location }) => {
    return await getSettlements({ data: { search: location.search } })
  },
  validateSearch: (search) => {
    return settlementsSearchSchema.parse(search)
  },
})

function SettlementsPage() {
  const { totalCount, settlements } = Route.useLoaderData()
  const search = Route.useSearch()

  return (
    <div className="flex flex-col gap-6 py-6 max-w-7xl mx-auto">
      <SettlementsFilters key={JSON.stringify(search)} search={search} />
      <SettlementsTable settlements={settlements} />
      <TableSummary totalCount={totalCount} resultCount={settlements.length} />
    </div>
  )
}
