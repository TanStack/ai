import type { DashboardState } from './types'
import { TileGrid } from './TileGrid'
import { ActivityDrawer } from './ActivityDrawer'

export function DashboardPanel({
  state,
  onClearEvents,
}: {
  state: DashboardState
  onClearEvents: () => void
}) {
  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <TileGrid state={state} />
      <ActivityDrawer events={state.globalEvents} onClear={onClearEvents} />
    </div>
  )
}
