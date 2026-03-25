import type { AgentSessionSummary } from './types'

export const SKILL_PATTERNS = ['functions.', 'function_', 'schema', 'api.', 'api_', 'endpoint', 'tool']

export function countSkills(memory: Record<string, unknown>): number {
  return Object.keys(memory).filter((key) =>
    SKILL_PATTERNS.some((p) => key.toLowerCase().includes(p)),
  ).length
}

export function TileSkills({
  session,
  accentColor,
}: {
  session: AgentSessionSummary | null
  accentColor: string
}) {
  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p className="text-xs">No session data — tile hasn't been queried yet</p>
      </div>
    )
  }

  const skillEntries = Object.entries(session.memory).filter(([key]) =>
    SKILL_PATTERNS.some((p) => key.toLowerCase().includes(p)),
  )

  if (skillEntries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-xs">No skills discovered yet</p>
          <p className="text-[10px] mt-1 text-gray-600">
            Skills populate as the agent discovers function schemas and API patterns
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
      {skillEntries.map(([key, value]) => (
        <div key={key} className="rounded border border-gray-700/40 bg-gray-800/30 px-2 py-1.5">
          <div className="text-[10px] font-mono font-medium" style={{ color: accentColor }}>
            {key}
          </div>
          <pre className="mt-1 text-[9px] text-gray-400 overflow-x-auto max-h-20 overflow-y-auto font-mono whitespace-pre-wrap">
            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  )
}
