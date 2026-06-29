/**
 * Client-safe definitions for use in the /sandboxes page.
 *
 * This module deliberately does NOT import from sandbox-triage.ts or any
 * harness/provider adapter packages (ai-claude-code, ai-codex, etc.) because
 * those pull in server-only native deps (dockerode, @anthropic-ai/sdk,
 * @modelcontextprotocol/sdk/server/streamableHttp → @hono/node-server, …)
 * that must not reach the client bundle. All values here are pure, no imports.
 */

// Pure string-literal types — re-exported by sandbox-triage.ts (single source of truth here).
export type HarnessName = 'claude-code' | 'codex' | 'opencode'
export type ProviderName = 'docker' | 'local' | 'vercel' | 'daytona'
export type Verdict = 'relevant' | 'not-relevant' | 'uncertain'

const VERDICTS: ReadonlySet<Verdict> = new Set([
  'relevant',
  'not-relevant',
  'uncertain',
])

/** Read the agent's required `VERDICT: <value>` first line. Returns null if missing/unknown. */
export function parseVerdict(text: string): Verdict | null {
  const line = text.split('\n').find((l) => /^\s*verdict\s*:/i.test(l))
  if (!line) return null
  const value = line.split(':')[1]?.trim().toLowerCase()
  return value && VERDICTS.has(value as Verdict) ? (value as Verdict) : null
}

// Picker-safe shape: only the label, no factory functions or server-only deps.
export interface PickerSpec {
  label: string
}

export const HARNESSES: Record<string, PickerSpec> = {
  'claude-code': { label: 'Claude Code' },
  codex: { label: 'Codex' },
  opencode: { label: 'OpenCode' },
}

export const PROVIDERS: Record<string, PickerSpec> = {
  docker: { label: 'Docker' },
  local: { label: 'Local process' },
  vercel: { label: 'Vercel' },
  daytona: { label: 'Daytona' },
}
