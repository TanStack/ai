import type { DashboardState } from './types'
import { DashboardTile } from './DashboardTile'
import { INITIAL_MANIFEST } from '@/lib/dashboard/manifest'

export function TileGrid({ state }: { state: DashboardState }) {
  const tileIds = INITIAL_MANIFEST.tiles.map((t) => t.id)

  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-3 p-3 flex-1 min-h-0">
      {tileIds.map((id) => {
        const tile = state.tiles[id]
        if (!tile) return null
        return <DashboardTile key={id} tile={tile} />
      })}
    </div>
  )
}
