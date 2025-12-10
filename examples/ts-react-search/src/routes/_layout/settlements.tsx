import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import SettlementsFilters from '@/features/settlements/SettlementsFilters'
import { settlementsSearchSchema } from '@/features/settlements/constants'
import Spinner from '@/components/Spinner'
import SettlementsManager from '@/features/settlements/SettlementsManager'
import settlementsCollection from '@/features/settlements/settlementsCollection'

export const Route = createFileRoute('/_layout/settlements')({
  component: SettlementsPage,
  loader: async () => {
    await settlementsCollection.preload()
    return null
  },
  validateSearch: zodValidator(settlementsSearchSchema),
})

function SettlementsPage() {
  const search = Route.useSearch()

  return (
    <div className="flex flex-col gap-6 py-6 max-w-7xl mx-auto">
      <SettlementsFilters key={JSON.stringify(search)} search={search} />
      <ClientOnly fallback={<Spinner />}>
        <SettlementsManager search={search} />
      </ClientOnly>
    </div>
  )
}
