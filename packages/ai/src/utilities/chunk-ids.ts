import type { StreamChunk } from '../types'
import { tanstackMetadata } from './merge-metadata'

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Run id on the spec event, or `metadata.tanstack.runId` after normalize. */
export function getChunkRunId(chunk: StreamChunk): string | undefined {
  if ('runId' in chunk) {
    const top = stringField(chunk.runId)
    if (top !== undefined) return top
  }
  return stringField(tanstackMetadata(chunk)?.runId)
}

/** Thread id on the spec event, or `metadata.tanstack.threadId` after normalize. */
export function getChunkThreadId(chunk: StreamChunk): string | undefined {
  if ('threadId' in chunk) {
    const top = stringField(chunk.threadId)
    if (top !== undefined) return top
  }
  return stringField(tanstackMetadata(chunk)?.threadId)
}
