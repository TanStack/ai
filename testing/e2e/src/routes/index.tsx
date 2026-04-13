import { Link, createFileRoute } from '@tanstack/react-router'
import { ALL_PROVIDERS } from '@/lib/types'
import { getSupportedFeatures } from '@/lib/feature-support'

export const Route = createFileRoute('/')({
  component: IndexPage,
})

function IndexPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Providers</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {ALL_PROVIDERS.map((provider) => (
          <Link
            key={provider}
            to="/$provider"
            params={{ provider }}
            className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg hover:border-orange-500/40 transition-colors text-center"
          >
            <span className="text-sm font-medium">{provider}</span>
            <span className="block text-xs text-gray-400 mt-1">
              {getSupportedFeatures(provider).length} features
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
