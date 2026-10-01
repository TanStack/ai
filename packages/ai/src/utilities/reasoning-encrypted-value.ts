import { EventType } from '../types'
import type { ReasoningEncryptedValueEvent } from '../types'

/** Spec event that carries a provider thinking / tool-call signature blob. */
export function reasoningEncryptedValue(opts: {
  subtype: 'message' | 'tool-call'
  entityId: string
  encryptedValue: string
  timestamp?: number
}): ReasoningEncryptedValueEvent {
  return {
    type: EventType.REASONING_ENCRYPTED_VALUE,
    subtype: opts.subtype,
    entityId: opts.entityId,
    encryptedValue: opts.encryptedValue,
    ...(opts.timestamp !== undefined ? { timestamp: opts.timestamp } : {}),
  }
}

/**
 * Id prefix for the reasoning message of a redacted thinking block (Anthropic
 * `redacted_thinking`). AG-UI's `encryptedValue` does not say what kind of
 * bytes it holds (ag-ui-protocol/ag-ui#2884), so the id that `entityId` points
 * to says it. AG-UI clients keep message ids, but they drop event metadata.
 */
export const REDACTED_THINKING_ID_PREFIX = 'redacted_thinking-'

export function isRedactedThinkingId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(REDACTED_THINKING_ID_PREFIX)
}
