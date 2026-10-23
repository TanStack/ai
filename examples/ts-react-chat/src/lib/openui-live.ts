/**
 * SERVER-ONLY. Tier F live data sources — the MCP-Apps-native way.
 *
 * A data source is `(params, emit) => cleanup`: it pushes values over time and
 * returns a teardown. The model binds an artifact to one by name via
 * `create_artifact({ dataSource: { name, params } })`; the client opens an SSE
 * stream to /api/openui-live and pushes each value into the frame by updating
 * the artifact's `toolInput` (which AppRenderer forwards to the guest as
 * `ui/notifications/tool-input`). No custom `ogui/1` transport — this stays on
 * the MCP Apps standard, so artifacts remain portable `ui://` resources.
 *
 * ponytail: one demo source. Add more by registering them here; the catalog
 * and the SSE route pick them up automatically.
 */

export type DataSource = (
  params: Record<string, unknown>,
  emit: (value: unknown) => void,
) => () => void

interface SourceEntry {
  describe: string
  run: DataSource
}

const SOURCES: Record<string, SourceEntry> = {
  spendFeed: {
    describe:
      '"spendFeed"(intervalMs?) -> { total, delta, at }: a live running spend total in USD that ticks up over time.',
    run: (params, emit) => {
      const intervalMs =
        typeof params.intervalMs === 'number' ? params.intervalMs : 1000
      let total = 0
      const tick = () => {
        const delta = 50 + Math.round(Math.random() * 450)
        total += delta
        emit({ total, delta, at: new Date().toISOString() })
      }
      tick() // emit once immediately so the view has data fast
      const timer = setInterval(tick, intervalMs)
      return () => clearInterval(timer)
    },
  },
}

export function getDataSource(name: string): SourceEntry | undefined {
  return SOURCES[name]
}

/** One-line-per-source catalog for the system prompt. */
export function describeLiveSourcesForPrompt(): string {
  return Object.values(SOURCES)
    .map((s) => `- ${s.describe}`)
    .join('\n')
}
