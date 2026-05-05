import { Link, createFileRoute } from '@tanstack/react-router'
import type { Provider } from '@/lib/types'
import { ALL_PROVIDERS } from '@/lib/types'
import { getSupportedFeatures } from '@/lib/feature-support'

export const Route = createFileRoute('/$provider/')({
  component: ProviderPage,
})

function ProviderPage() {
  const { provider } = Route.useParams() as { provider: Provider }
  const features = getSupportedFeatures(provider)

  if (!ALL_PROVIDERS.includes(provider)) {
    return <div className="p-6 text-red-400">Unknown provider: {provider}</div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">{provider} Features</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {features.map((feature) => (
          <Link
            key={feature}
            to="/$provider/$feature"
            params={{ provider, feature }}
            search={{ testId: undefined, aimockPort: undefined }}
            className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg hover:border-orange-500/40 transition-colors text-center text-sm"
          >
            {feature}
          </Link>
        ))}
      </div>
    </div>
  )
}
