import type { DashboardManifest } from '@/lib/dashboard/manifest'
import type { AgentActivityEvent, AgentSessionSummary, DashboardState, TileResult } from './types'

export type DashboardAction =
  | { type: 'TILE_LOADING'; tileId: string; event: AgentActivityEvent }
  | { type: 'TILE_MEMORY_UPDATE'; tileId: string; event: AgentActivityEvent }
  | { type: 'TILE_SESSION_UPDATED'; tileId: string; session: AgentSessionSummary; event: AgentActivityEvent }
  | { type: 'TILE_COMPLETE'; tileId: string; data: unknown; event: AgentActivityEvent }
  | { type: 'ADD_EVENT'; event: AgentActivityEvent; tileId?: string }
  | { type: 'CLEAR_EVENTS' }

function tryExtractJson(text: string): unknown | null {
  // Try to find JSON embedded in text (agent sometimes prefixes with explanation)
  const jsonPatterns = [
    /```json\s*([\s\S]*?)```/,  // ```json ... ```
    /```\s*([\s\S]*?)```/,       // ``` ... ```
    /(\{[\s\S]*\})\s*$/,         // last { ... } block
    /(\[[\s\S]*\])\s*$/,         // last [ ... ] block
  ]
  for (const pattern of jsonPatterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      try {
        return JSON.parse(match[1].trim())
      } catch { /* try next pattern */ }
    }
  }
  return null
}

function extractStructured(obj: Record<string, unknown>): TileResult {
  const display = (['table', 'bar_chart', 'line_chart', 'metric', 'list'].includes(obj.display as string)
    ? obj.display
    : 'table') as TileResult['display']
  return {
    data: obj.data ?? obj,
    display,
    title: typeof obj.title === 'string' ? obj.title : undefined,
    summary: typeof obj.summary === 'string' ? obj.summary : undefined,
    columns: Array.isArray(obj.columns) ? obj.columns : undefined,
  }
}

export function parseTileResult(data: unknown): TileResult {
  // Handle parseError from executePrompt (agent returned non-JSON text)
  if (data && typeof data === 'object' && 'parseError' in data) {
    const raw = (data as { raw?: string }).raw ?? ''
    // Try to extract JSON from the raw text
    const extracted = tryExtractJson(raw)
    if (extracted) return parseTileResult(extracted)
    // Fall back to showing raw text
    return { data: raw, display: 'table', summary: raw.slice(0, 200) }
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>

    // Direct structured response with display field
    if ('display' in obj) {
      return extractStructured(obj)
    }

    // Nested in a result/response wrapper
    for (const key of ['result', 'response', 'output']) {
      const nested = obj[key]
      if (nested && typeof nested === 'object' && !Array.isArray(nested) && 'display' in nested) {
        return extractStructured(nested as Record<string, unknown>)
      }
    }

    // Object with a data array but no display hint — guess table
    if (Array.isArray(obj.data)) {
      return { data: obj.data, display: 'table', title: typeof obj.title === 'string' ? obj.title : undefined, summary: typeof obj.summary === 'string' ? obj.summary : undefined }
    }
  }

  if (Array.isArray(data)) {
    return { data, display: 'table' }
  }

  // Single string — just show it
  if (typeof data === 'string') {
    return { data, display: 'table', summary: data.slice(0, 200) }
  }

  return { data, display: 'table' }
}

export function createInitialState(manifest: DashboardManifest): DashboardState {
  const tiles: DashboardState['tiles'] = {}
  for (const tile of manifest.tiles) {
    tiles[tile.id] = {
      manifest: tile,
      session: null,
      lastResult: null,
      events: [],
      isLoading: false,
    }
  }
  return { tiles, globalEvents: [] }
}

export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'TILE_LOADING': {
      const tile = state.tiles[action.tileId]
      if (!tile) return { ...state, globalEvents: [...state.globalEvents, action.event] }
      return {
        ...state,
        tiles: {
          ...state.tiles,
          [action.tileId]: {
            ...tile,
            isLoading: true,
            events: [...tile.events, action.event],
          },
        },
        globalEvents: [...state.globalEvents, action.event],
      }
    }

    case 'TILE_MEMORY_UPDATE': {
      const tile = state.tiles[action.tileId]
      if (!tile) return { ...state, globalEvents: [...state.globalEvents, action.event] }
      const memData = action.event.data as { key: string; value: unknown } | undefined
      const updatedSession = tile.session
        ? { ...tile.session, memory: { ...tile.session.memory, ...(memData ? { [memData.key]: memData.value } : {}) } }
        : null
      return {
        ...state,
        tiles: {
          ...state.tiles,
          [action.tileId]: {
            ...tile,
            session: updatedSession,
            events: [...tile.events, action.event],
          },
        },
        globalEvents: [...state.globalEvents, action.event],
      }
    }

    case 'TILE_SESSION_UPDATED': {
      const tile = state.tiles[action.tileId]
      if (!tile) return { ...state, globalEvents: [...state.globalEvents, action.event] }
      return {
        ...state,
        tiles: {
          ...state.tiles,
          [action.tileId]: {
            ...tile,
            session: action.session,
            events: [...tile.events, action.event],
          },
        },
        globalEvents: [...state.globalEvents, action.event],
      }
    }

    case 'TILE_COMPLETE': {
      const tile = state.tiles[action.tileId]
      if (!tile) return { ...state, globalEvents: [...state.globalEvents, action.event] }
      return {
        ...state,
        tiles: {
          ...state.tiles,
          [action.tileId]: {
            ...tile,
            isLoading: false,
            lastResult: parseTileResult(action.data),
            events: [...tile.events, action.event],
          },
        },
        globalEvents: [...state.globalEvents, action.event],
      }
    }

    case 'ADD_EVENT': {
      const newState = {
        ...state,
        globalEvents: [...state.globalEvents, action.event],
      }
      if (action.tileId && state.tiles[action.tileId]) {
        newState.tiles = {
          ...state.tiles,
          [action.tileId]: {
            ...state.tiles[action.tileId],
            events: [...state.tiles[action.tileId].events, action.event],
          },
        }
      }
      return newState
    }

    case 'CLEAR_EVENTS':
      return {
        ...state,
        globalEvents: [],
      }

    default:
      return state
  }
}
