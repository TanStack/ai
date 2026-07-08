interface NpmDataComponent {
  id: string
  type: string
  data: any
  timestamp: number
}

interface NpmDataSidebarProps {
  components: Array<NpmDataComponent>
  className?: string
}

function PackageInfoCard({
  name,
  description,
  version,
  maintainers,
  keywords,
}: {
  name: string
  description: string | null
  version: string
  maintainers: Array<{ name: string; email?: string }>
  keywords: string[]
}) {
  return (
    <div className="p-4 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-lg border border-emerald-500/30">
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 bg-emerald-500 text-white text-xs rounded-full font-bold">
          Package
        </span>
        <span className="text-emerald-300 text-sm font-mono">
          {new Date().toLocaleTimeString()}
        </span>
      </div>
      <h3 className="text-lg font-bold text-emerald-400">{name}</h3>
      <div className="mt-2 space-y-2">
        <div>
          <p className="text-sm font-semibold text-white">v{version}</p>
          {description && (
            <p className="text-sm text-gray-300 mt-1">{description}</p>
          )}
        </div>
        {maintainers.length > 0 && (
          <div>
            <p className="text-xs text-gray-400">Maintainers:</p>
            <p className="text-sm text-gray-300">
              {maintainers.map((m) => m.name).join(', ')}
            </p>
          </div>
        )}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {keywords.slice(0, 5).map((keyword) => (
              <span
                key={keyword}
                className="px-2 py-0.5 bg-gray-700/50 text-gray-300 text-xs rounded"
              >
                {keyword}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CompareCard({
  packages,
  period,
}: {
  packages: Array<{ package: string; downloads: number }>
  period: string
}) {
  return (
    <div className="p-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-lg border border-amber-500/30">
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full font-bold">
          Compare
        </span>
        <span className="text-amber-300 text-sm font-mono">
          {new Date().toLocaleTimeString()}
        </span>
      </div>
      <h3 className="text-lg font-bold text-amber-400">Package Comparison</h3>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-gray-400">
          {period === 'last-week'
            ? 'Last 7 days'
            : period === 'last-month'
              ? 'Last 30 days'
              : 'Last year'}
        </p>
        <div className="space-y-1">
          {packages.map((pkg) => (
            <div
              key={pkg.package}
              className="flex justify-between items-center"
            >
              <span className="text-sm text-gray-300 flex-1">
                {pkg.package}
              </span>
              <span className="text-sm font-bold text-white">
                {pkg.downloads.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function NpmDataCard({ type, data }: { type: string; data: any }) {
  switch (type) {
    case 'packageInfo':
      return (
        <PackageInfoCard
          name={data.name}
          description={data.description}
          version={data.version}
          maintainers={data.maintainers}
          keywords={data.keywords}
        />
      )
    case 'compare':
      return <CompareCard packages={data.packages} period={data.period} />
    default:
      return (
        <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
          <p className="text-xs text-gray-400">Unknown type: {type}</p>
          <pre className="text-xs text-gray-300 mt-2 overflow-x-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )
  }
}

export function NpmDataSidebar({
  components,
  className = '',
}: NpmDataSidebarProps) {
  return (
    <aside
      className={`w-96 border-l border-cyan-500/20 bg-gray-800/50 overflow-y-auto ${className}`}
    >
      <div className="p-4 space-y-4">
        <div className="border-b border-cyan-500/20 pb-3">
          <h2 className="text-sm font-semibold text-cyan-400">NPM Data</h2>
          <p className="text-xs text-gray-400 mt-1">Live data from npm tools</p>
        </div>

        {components.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No data yet
          </div>
        ) : (
          <div className="space-y-4">
            {components.map((component) => (
              <div
                key={component.id}
                className="animate-in fade-in slide-in-from-right"
              >
                <NpmDataCard type={component.type} data={component.data} />
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
