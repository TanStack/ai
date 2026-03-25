import { useMemo, useState } from 'react'
import type { TileState } from './types'
import { TILE_COLORS } from './types'
import { TileHeader, type TileTab } from './TileHeader'
import { TileVisualization } from './TileVisualization'
import { TileLogs } from './TileLogs'
import { TileMemory } from './TileMemory'
import { TileSkills, countSkills } from './TileSkills'

export function DashboardTile({ tile }: { tile: TileState }) {
  const [activeTab, setActiveTab] = useState<TileTab>('viz')
  const colors = TILE_COLORS[tile.manifest.id] ?? TILE_COLORS.revenue_by_region
  const isWarm = tile.session !== null

  const counts = useMemo(() => {
    const memory = tile.session?.memory ?? {}
    return {
      logs: tile.events.length,
      memory: Object.keys(memory).length,
      skills: countSkills(memory),
    }
  }, [tile.events.length, tile.session?.memory])

  return (
    <div className={`flex flex-col rounded-lg border ${colors.border} bg-gray-900/50 overflow-hidden min-h-0`}>
      <TileHeader
        name={tile.manifest.name}
        isLoading={tile.isLoading}
        isWarm={isWarm}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        colors={colors}
        counts={counts}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === 'viz' && (
          <TileVisualization result={tile.lastResult} isLoading={tile.isLoading} accent={colors.accent} />
        )}
        {activeTab === 'logs' && <TileLogs events={tile.events} />}
        {activeTab === 'memory' && <TileMemory session={tile.session} accentColor={colors.accent} />}
        {activeTab === 'skills' && <TileSkills session={tile.session} accentColor={colors.accent} />}
      </div>
    </div>
  )
}
