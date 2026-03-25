export type TileTab = 'viz' | 'logs' | 'memory' | 'skills'

export function TileHeader({
  name,
  isLoading,
  isWarm,
  activeTab,
  onTabChange,
  colors,
  counts,
}: {
  name: string
  isLoading: boolean
  isWarm: boolean
  activeTab: TileTab
  onTabChange: (tab: TileTab) => void
  colors: { text: string; border: string }
  counts: { logs: number; memory: number; skills: number }
}) {
  const tabs: Array<{ id: TileTab; label: string; count?: number }> = [
    { id: 'viz', label: 'Viz' },
    { id: 'logs', label: 'Logs', count: counts.logs },
    { id: 'memory', label: 'Memory', count: counts.memory },
    { id: 'skills', label: 'Skills', count: counts.skills },
  ]

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 border-b ${colors.border}`}>
      <span className={`relative flex h-2 w-2 shrink-0`}>
        {isLoading && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${isLoading ? 'bg-green-400' : isWarm ? 'bg-green-500' : 'bg-gray-600'}`} />
      </span>
      <span className={`${colors.text} text-xs font-medium flex-1 truncate`}>{name}</span>
      <div className="flex gap-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(activeTab === tab.id && tab.id !== 'viz' ? 'viz' : tab.id)}
            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors flex items-center gap-1 ${
              activeTab === tab.id
                ? `${colors.text} bg-white/10`
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className={`text-[9px] min-w-[14px] text-center px-0.5 py-px rounded-full leading-none ${
                activeTab === tab.id ? 'bg-white/15' : 'bg-gray-700/80 text-gray-400'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
