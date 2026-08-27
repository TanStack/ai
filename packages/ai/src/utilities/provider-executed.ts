import type { ProviderExecutedToolMetadata } from '../types'

export function getProviderExecutedMetadata(
  toolCall: { metadata?: unknown } | null | undefined,
): ProviderExecutedToolMetadata | null {
  const metadata = toolCall?.metadata
  const isInvalidMetadata =
    typeof metadata === 'object' &&
    metadata !== null &&
    (metadata as ProviderExecutedToolMetadata).providerExecuted === true
  if (isInvalidMetadata) {
    return metadata as ProviderExecutedToolMetadata
  }
  return null
}

export function isProviderExecutedToolCall(
  toolCall: { metadata?: unknown } | null | undefined,
): boolean {
  return getProviderExecutedMetadata(toolCall) !== null
}
