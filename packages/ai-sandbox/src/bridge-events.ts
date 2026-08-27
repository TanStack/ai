import { EventType, withTanstackMetadata } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

export interface BridgeEventChannel {
  /** Pass as the bridge's `emitCustomEvent`; buffers a CUSTOM chunk for the stream. */
  emitCustomEvent: (eventName: string, value: Record<string, unknown>) => void
  /** Live CUSTOM-chunk stream; ends after {@link close} once drained. */
  stream: AsyncIterable<StreamChunk>
  /** Stop the stream (call when the run's main output is done). */
  close: () => void
}

/** Create a channel whose emitted events become CUSTOM {@link StreamChunk}s. */
export function createBridgeEventChannel(meta: {
  model: string
  threadId?: string
  runId?: string
}): BridgeEventChannel {
  const buffer: Array<StreamChunk> = []
  let notify: (() => void) | null = null
  let closed = false

  async function* stream(): AsyncIterable<StreamChunk> {
    for (;;) {
      const next = buffer.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      if (closed) return
      await new Promise<void>((resolve) => {
        notify = resolve
      })
      notify = null
    }
  }

  return {
    emitCustomEvent(eventName, value) {
      if (closed) return
      buffer.push(
        withTanstackMetadata(
          {
            type: EventType.CUSTOM,
            name: eventName,
            value,
            timestamp: Date.now(),
          },
          {
            model: meta.model,
            ...(meta.threadId !== undefined ? { threadId: meta.threadId } : {}),
            ...(meta.runId !== undefined ? { runId: meta.runId } : {}),
          },
        ) as StreamChunk,
      )
      notify?.()
    },
    close() {
      closed = true
      notify?.()
    },
    stream: stream(),
  }
}

export async function* mergeChunkStreams(
  base: AsyncIterable<StreamChunk>,
  side: AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  const baseIt = base[Symbol.asyncIterator]()
  const sideIt = side[Symbol.asyncIterator]()
  let baseNext = baseIt.next().then((r) => ({ from: 'base' as const, r }))
  let sideNext = sideIt.next().then((r) => ({ from: 'side' as const, r }))
  let sideLive = true
  try {
    for (;;) {
      const winner = await Promise.race(
        sideLive ? [baseNext, sideNext] : [baseNext],
      )
      if (winner.from === 'base') {
        if (winner.r.done) return
        yield winner.r.value
        baseNext = baseIt.next().then((r) => ({ from: 'base' as const, r }))
      } else if (winner.r.done) {
        sideLive = false
      } else {
        yield winner.r.value
        sideNext = sideIt.next().then((r) => ({ from: 'side' as const, r }))
      }
    }
  } finally {
    const baseReturn = baseIt.return?.(undefined)
    if (baseReturn) void baseReturn.catch(() => {})
    const sideReturn = sideIt.return?.(undefined)
    if (sideReturn) void sideReturn.catch(() => {})
  }
}
