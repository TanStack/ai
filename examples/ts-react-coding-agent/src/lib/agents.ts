/**
 * Registry of coding-agent harnesses this example can drive.
 *
 * Each entry maps to a harness adapter on the server (see
 * `src/routes/api.chat.ts`). Today only Claude Code ships; Codex and
 * Gemini CLI slots are reserved for future harness adapters.
 */
export const AGENTS = [
  { id: 'claude-code', label: 'Claude Code', available: true },
  { id: 'codex', label: 'Codex (coming soon)', available: false },
  { id: 'gemini-cli', label: 'Gemini CLI (coming soon)', available: false },
] as const

/** Agent ids with a working adapter behind them. */
export type AgentId = 'claude-code'

export const DEFAULT_AGENT: AgentId = 'claude-code'

export function isAgentId(value: unknown): value is AgentId {
  return value === 'claude-code'
}

/**
 * What the agent is allowed to do in the workspace:
 * - `read-only`: it can read and search, but file edits and shell commands
 *   are blocked.
 * - `edit`: file edits are auto-approved; shell commands still get denied by
 *   the adapter's default permission policy (a deliberate demo of the
 *   permission system).
 */
export type AgentMode = 'read-only' | 'edit'

export function isAgentMode(value: unknown): value is AgentMode {
  return value === 'read-only' || value === 'edit'
}
