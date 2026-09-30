import { EventType } from '../types'
import { withTanstackMetadata } from './merge-metadata'
import type { ReasoningEncryptedValueEvent } from '../types'

/**
 * Spec event that carries a provider thinking / tool-call signature blob.
 * `redacted: true` marks a redacted thinking block, in `metadata.tanstack`.
 */
export function reasoningEncryptedValue(opts: {
  subtype: 'message' | 'tool-call'
  entityId: string
  encryptedValue: string
  timestamp?: number
  redacted?: boolean
}): ReasoningEncryptedValueEvent {
  const event: ReasoningEncryptedValueEvent = {
    type: EventType.REASONING_ENCRYPTED_VALUE,
    subtype: opts.subtype,
    entityId: opts.entityId,
    encryptedValue: opts.encryptedValue,
    ...(opts.timestamp !== undefined ? { timestamp: opts.timestamp } : {}),
  }
  return opts.redacted ? withTanstackMetadata(event, { redacted: true }) : event
}
