import type { ProviderExecutedToolMetadata } from '../types'

/**
 * Narrow a tool call's opaque `metadata` to the provider-executed convention.
 * Returns the typed metadata when the call is provider-executed, else `null`.
 *
 * @see ProviderExecutedToolMetadata
 */
export function getProviderExecutedMetadata(
  toolCall: { metadata?: unknown } | null | undefined,
): ProviderExecutedToolMetadata | null {
  const metadata = toolCall?.metadata
  if (
    typeof metadata === 'object' &&
    metadata !== null &&
    (metadata as ProviderExecutedToolMetadata).providerExecuted === true
  ) {
    return metadata as ProviderExecutedToolMetadata
  }
  return null
}

/**
 * True when a tool call was executed by the provider (e.g. Anthropic
 * `web_search` / `web_fetch` server tools) rather than the agent loop. Such
 * calls must not be routed to client-side execution and are already "complete".
 */
export function isProviderExecutedToolCall(
  toolCall: { metadata?: unknown } | null | undefined,
): boolean {
  return getProviderExecutedMetadata(toolCall) !== null
}
