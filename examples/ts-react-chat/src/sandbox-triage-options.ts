/**
 * Client-safe re-exports from sandbox-triage for use in the /sandboxes page.
 *
 * This module deliberately does NOT import the harness/provider adapter
 * packages (ai-claude-code, ai-codex, etc.) because those pull in
 * server-only native deps (dockerode, @anthropic-ai/sdk, …) that must not
 * reach the client bundle.  The page only needs picker labels + parseVerdict.
 */

export type { HarnessName, ProviderName, Verdict } from './sandbox-triage'
export { parseVerdict } from './sandbox-triage'

// Picker-safe shape: only the label, no factory functions or server-only deps.
export interface PickerSpec {
  label: string
}

export const HARNESSES: Record<string, PickerSpec> = {
  'claude-code': { label: 'Claude Code' },
  codex: { label: 'Codex' },
  'gemini-cli': { label: 'Gemini CLI' },
  opencode: { label: 'OpenCode' },
}

export const PROVIDERS: Record<string, PickerSpec> = {
  docker: { label: 'Docker' },
  local: { label: 'Local process' },
  vercel: { label: 'Vercel' },
  daytona: { label: 'Daytona' },
}
