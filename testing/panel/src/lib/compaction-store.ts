import type { CompactionInfo } from '@tanstack/ai-compaction'

/**
 * Process-local record of compaction events for the `/compaction` demo. The
 * chat route writes here from `withCompaction`'s `onCompact` callback; the
 * inspect route reads it. Same singleton or the reader sees nothing.
 */
export interface CompactionEvent extends CompactionInfo {
  /** Wall-clock time the compaction fired. */
  at: number
}

const eventsByThread = new Map<string, Array<CompactionEvent>>()

export function recordCompaction(threadId: string, info: CompactionInfo): void {
  const list = eventsByThread.get(threadId) ?? []
  list.push({ ...info, at: Date.now() })
  eventsByThread.set(threadId, list)
}

export function getCompactions(threadId: string): Array<CompactionEvent> {
  return eventsByThread.get(threadId) ?? []
}

export function clearCompactions(threadId: string): void {
  eventsByThread.delete(threadId)
}
