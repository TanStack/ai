import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import DisputesFilters from '@/features/disputes/DisputesFilters'
import { disputesSearchSchema } from '@/features/disputes/constants'
import disputesCollection from '@/features/disputes/disputesCollection'
import DisputesManager from '@/features/disputes/DisputesManager'
import Spinner from '@/components/Spinner'

export const Route = createFileRoute('/_layout/disputes')({
  component: DisputesPage,
  loader: async () => {
    await disputesCollection.preload()
    return null
  },
  validateSearch: zodValidator(disputesSearchSchema),
})

function DisputesPage() {
  const search = Route.useSearch()

  return (
    <div className="flex flex-col gap-6 py-6 max-w-7xl mx-auto">
      <DisputesFilters key={JSON.stringify(search)} search={search} />
      <ClientOnly fallback={<Spinner />}>
        <DisputesManager search={search} />
      </ClientOnly>
    </div>
  )
}
