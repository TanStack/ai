/**
 * Client-safe harness/provider definitions for the picker UI.
 *
 * This module imports NOTHING: the real adapters and providers
 * (`@tanstack/ai-claude-code`, `@tanstack/ai-sandbox-docker`, …) pull in
 * server-only native deps that must never reach the client bundle. `index.tsx`
 * (client) uses the option labels here; `sandbox-agent.ts` (server) re-uses the
 * types and guards. Single source of truth for the two axes.
 */

export type HarnessName = 'claude-code' | 'codex' | 'opencode'
export type ProviderName = 'docker' | 'local' | 'vercel' | 'daytona'

export interface PickerOption<T> {
  value: T
  label: string
}

export const HARNESS_OPTIONS: ReadonlyArray<PickerOption<HarnessName>> = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'opencode', label: 'OpenCode' },
]

export const PROVIDER_OPTIONS: ReadonlyArray<PickerOption<ProviderName>> = [
  { value: 'docker', label: 'Docker' },
  { value: 'local', label: 'Local process' },
  { value: 'vercel', label: 'Vercel' },
  { value: 'daytona', label: 'Daytona' },
]

export function isHarness(value: unknown): value is HarnessName {
  return HARNESS_OPTIONS.some((o) => o.value === value)
}

export function isProvider(value: unknown): value is ProviderName {
  return PROVIDER_OPTIONS.some((o) => o.value === value)
}
