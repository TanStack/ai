import { createFileRoute } from '@tanstack/react-router'
import SeedanceStudio from '@/components/SeedanceStudio'
import { getSeedanceCapabilitiesFn } from '@/lib/server-functions'

function SeedancePage() {
  const capabilities = Route.useLoaderData()

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Seedance Studio
          </h1>
          <p className="text-gray-400">
            BytePlus Seedance video generation, straight from the ModelArk task
            API — no fal in between. The server holds{' '}
            <code className="text-gray-300">ARK_API_KEY</code>; the browser only
            ever sees job ids.
          </p>
        </div>

        <SeedanceStudio capabilities={capabilities} />
      </div>
    </div>
  )
}

function SeedanceError({ error }: { error: Error }) {
  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">Seedance Studio</h1>
        <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">
            Could not read the Seedance capability table from{' '}
            <code>@tanstack/ai-byteplus</code>: {error.message}
          </p>
          <p className="text-gray-400 text-sm mt-2">
            The studio drives every control off that table, so it can't render
            without it. This means the adapter's model metadata changed shape —
            rebuild the workspace packages, and check{' '}
            <code>getSeedanceCapabilitiesFn</code> against the current{' '}
            <code>availableDurations()</code> contract.
          </p>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/seedance')({
  // The capability table is static adapter metadata, so it loads with the
  // route instead of being restated in the client bundle.
  loader: () => getSeedanceCapabilitiesFn(),
  component: SeedancePage,
  // The loader asserts the adapter's duration options are a range. That holds
  // for every Seedance model today, but a shape change should explain itself
  // here rather than surfacing as a bare 500.
  errorComponent: SeedanceError,
})
