import type { TileManifest } from '@/lib/dashboard/manifest'

export interface TileResult {
  data: unknown
  display: 'table' | 'bar_chart' | 'line_chart' | 'metric' | 'list'
  title?: string
  summary?: string
  columns?: string[]
}

export interface AgentSessionSummary {
  name: string
  memory: Record<string, unknown>
  createdAt: number
  lastUsedAt: number
}

export interface AgentActivityEvent {
  id: string
  type: string
  tileId?: string
  tileName?: string
  agentName: string
  message: string
  data?: unknown
  timestamp: number
}

export interface TileState {
  manifest: TileManifest
  session: AgentSessionSummary | null
  lastResult: TileResult | null
  events: AgentActivityEvent[]
  isLoading: boolean
}

export interface DashboardState {
  tiles: Record<string, TileState>
  globalEvents: AgentActivityEvent[]
}

export const TILE_COLORS: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  revenue_by_region: {
    bg: 'bg-emerald-900/20',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    accent: '#34d399',
  },
  product_performance: {
    bg: 'bg-amber-900/20',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    accent: '#fbbf24',
  },
  customer_overview: {
    bg: 'bg-sky-900/20',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
    accent: '#38bdf8',
  },
  support_health: {
    bg: 'bg-rose-900/20',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    accent: '#fb7185',
  },
}

export const ORCHESTRATOR_COLORS = {
  bg: 'bg-violet-900/20',
  text: 'text-violet-300',
  border: 'border-violet-500/30',
  accent: '#a78bfa',
}
