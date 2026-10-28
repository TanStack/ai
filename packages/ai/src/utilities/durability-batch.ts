import { CUSTOM_EVENT } from '../custom-events'
import type { CustomEvent, StreamChunk } from '../types'
import { tanstackMetadata, withTanstackMetadata } from './merge-metadata'

/**
 * High-volume CUSTOM names that stay in the durability batch.
 * Everything else flushes as soon as it is emitted.
 */
const BATCHED_CUSTOM_EVENT_NAMES = new Set<string>([
  CUSTOM_EVENT.PROCESS_STDOUT,
  CUSTOM_EVENT.PROCESS_STDERR,
  'sandbox.file',
  'sandbox.file.diff',
])

function hasBatchHint(chunk: StreamChunk): boolean {
  const tanstack = tanstackMetadata(chunk)
  if (tanstack == null) return false
  return Reflect.get(tanstack, 'batch') === true
}

/** Mark a CUSTOM chunk so the durability producer keeps it in the batch. */
export function withDurabilityBatchHint(chunk: CustomEvent): CustomEvent {
  return withTanstackMetadata(chunk, { batch: true })
}

export function isDurabilityBatchedCustom(chunk: StreamChunk): boolean {
  if (chunk.type !== 'CUSTOM') return false
  if (BATCHED_CUSTOM_EVENT_NAMES.has(chunk.name)) return true
  return hasBatchHint(chunk)
}

/**
 * Drop the in-process batch hint so it does not sit in the log or on the wire.
 */
export function stripDurabilityBatchHint(chunk: StreamChunk): StreamChunk {
  const tanstack = tanstackMetadata(chunk)
  if (tanstack == null || Reflect.get(tanstack, 'batch') !== true) return chunk
  Reflect.deleteProperty(tanstack, 'batch')
  const metadata = chunk.metadata
  if (metadata != null && Object.keys(tanstack).length === 0) {
    Reflect.deleteProperty(metadata, 'tanstack')
    if (Object.keys(metadata).length === 0) {
      Reflect.deleteProperty(chunk, 'metadata')
    }
  }
  return chunk
}
