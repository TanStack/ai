/**
 * Harness picker options + type guards shared by the UI and `/api/run` validation.
 */

export const HARNESS_OPTIONS = [
  { value: 'grok', label: 'Grok Build' },
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
] as const

export type HarnessName = (typeof HARNESS_OPTIONS)[number]['value']

export const GROK_MODEL_OPTIONS = [
  { value: 'composer-2.5', label: 'Composer 2.5' },
  { value: 'grok-build-0.1', label: 'grok-build-0.1' },
] as const

export type GrokBuildModel = (typeof GROK_MODEL_OPTIONS)[number]['value']

export const GROK_PROTOCOL_OPTIONS = [
  { value: 'acp', label: 'ACP (default)' },
  { value: 'streaming-json', label: 'streaming-json' },
] as const

export type GrokBuildProtocol = (typeof GROK_PROTOCOL_OPTIONS)[number]['value']

export const GROK_TRANSPORT_OPTIONS = [
  { value: 'auto', label: 'auto' },
  { value: 'stdio', label: 'stdio' },
  { value: 'websocket', label: 'websocket' },
] as const

export type GrokTransport = (typeof GROK_TRANSPORT_OPTIONS)[number]['value']

export function isHarness(value: unknown): value is HarnessName {
  return (
    typeof value === 'string' &&
    HARNESS_OPTIONS.some((option) => option.value === value)
  )
}

export function isGrokModel(value: unknown): value is GrokBuildModel {
  return (
    typeof value === 'string' &&
    GROK_MODEL_OPTIONS.some((option) => option.value === value)
  )
}

export function isGrokProtocol(value: unknown): value is GrokBuildProtocol {
  return (
    typeof value === 'string' &&
    GROK_PROTOCOL_OPTIONS.some((option) => option.value === value)
  )
}

export function isGrokTransport(value: unknown): value is GrokTransport {
  return (
    typeof value === 'string' &&
    GROK_TRANSPORT_OPTIONS.some((option) => option.value === value)
  )
}