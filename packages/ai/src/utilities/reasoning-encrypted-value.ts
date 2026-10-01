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
