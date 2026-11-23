/**
 * Helpers that let a harness adapter surface custom events and activities
 * emitted by BRIDGED tools (via {@link ToolBridgeCoreOptions.emitCustomEvent}
 * and {@link ToolBridgeCoreOptions.emitActivity}) on its live output stream.
 *
 * The bridge runs out-of-band from the harness's own event stream, so a bridged
 * tool's progress/console events have no path to the client on their own. An
 * adapter creates a {@link BridgeEventChannel}, hands its `emitCustomEvent` and
 * `emitActivity` to the bridge provisioner, and
 * {@link mergeChunkStreams | merges} the channel's stream into its translated
 * output — so events interleave live while the agent runs (e.g. code mode's
 * `code_mode:console` logs during a long execution).
 */
import { EventType, withTanstackMetadata } from '@tanstack/ai'
import type {
  EmitCustomEventOptions,
  StreamChunk,
  ToolExecutionContext,
} from '@tanstack/ai'

export interface BridgeEventChannel {
  /** Pass as the bridge's `emitCustomEvent`; buffers a CUSTOM chunk for the stream. */
  emitCustomEvent: (
    eventName: string,
    value: Record<string, unknown>,
    options?: EmitCustomEventOptions,
  ) => void
  /**
   * Pass as the bridge's `emitActivity`. Buffers the `ACTIVITY_SNAPSHOT`
   * chunk of `definition.snapshot(id, content)` for the stream.
   *
   * @throws TypeError when the content fails the schema check of `definition`
   */
  emitActivity: NonNullable<ToolExecutionContext['emitActivity']>
  /**
   * Live stream of CUSTOM and ACTIVITY_SNAPSHOT chunks; ends after
   * {@link close} once drained.
   */
  stream: AsyncIterable<StreamChunk>
  /** Stop the stream (call when the run's main output is done). */
  close: () => void
}

const sideChannelClosers = new WeakMap<object, () => void>()

/**
 * Create a channel whose emitted events and activities become
 * {@link StreamChunk}s.
 */
export function createBridgeEventChannel(meta: {
  model: string
  threadId?: string
  runId?: string
}): BridgeEventChannel {
  const buffer: Array<StreamChunk> = []
  let notify: (() => void) | null = null
  let closed = false
  // The `metadata.tanstack` keys of each chunk from this channel.
  const runMetadata = {
    model: meta.model,
    ...(meta.threadId !== undefined ? { threadId: meta.threadId } : {}),
    ...(meta.runId !== undefined ? { runId: meta.runId } : {}),
  }

  function closeChannel() {
    closed = true
    notify?.()
  }

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

  const output = stream()
  sideChannelClosers.set(output, closeChannel)

  return {
    emitCustomEvent(eventName, value, options) {
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
            ...runMetadata,
            ...(options?.batch === true ? { batch: true } : {}),
          },
        ) as StreamChunk,
      )
      notify?.()
    },
    emitActivity(definition, id, content) {
      // Check the content before the `closed` check, so a bad content always
      // throws in the tool, as it does in `chat()`.
      const snapshot = definition.snapshot(id, content)
      if (closed) return
      buffer.push(withTanstackMetadata(snapshot, runMetadata))
      notify?.()
    },
    close: closeChannel,
    stream: output,
  }
}

type SideResult = {
  from: 'side'
  r: IteratorResult<StreamChunk, unknown>
}

/**
 * Merge a `side` chunk stream into a `base` chunk stream, yielding from whichever
 * settles first. Terminates when `base` ends (the run is over). If `side` came
 * from {@link createBridgeEventChannel}, closes that channel and drains
 * already-buffered side chunks before returning. Then releases the side
 * iterator — so a never-ending channel (until closed) doesn't hang the merge.
 */
export async function* mergeChunkStreams(
  base: AsyncIterable<StreamChunk>,
  side: AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  const baseIt = base[Symbol.asyncIterator]()
  const sideIt = side[Symbol.asyncIterator]()
  let baseNext = baseIt.next().then((r) => ({ from: 'base' as const, r }))
  let sideNext: Promise<SideResult> = sideIt
    .next()
    .then((r) => ({ from: 'side' as const, r }))
  let sideLive = true
  try {
    for (;;) {
      const winner = await Promise.race(
        sideLive ? [baseNext, sideNext] : [baseNext],
      )
      if (winner.from === 'base') {
        if (winner.r.done) {
          const closeSide = sideChannelClosers.get(side)
          closeSide?.()
          if (sideLive && closeSide) {
            let pending = sideNext
            for (;;) {
              const result = await pending
              if (result.r.done) break
              yield result.r.value
              pending = sideIt.next().then((r) => ({
                from: 'side' as const,
                r,
              }))
            }
          }
          return
        }
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
    // Fire-and-forget: do NOT await the side return. The channel generator is
    // suspended on a promise that only `close()` resolves, and `close()` runs in
    // the adapter's `finally` AFTER this merge completes — awaiting here would
    // deadlock. The adapter's `close()` lets the generator unwind afterwards.
    const baseReturn = baseIt.return?.(undefined)
    if (baseReturn) void baseReturn.catch(() => {})
    const sideReturn = sideIt.return?.(undefined)
    if (sideReturn) void sideReturn.catch(() => {})
  }
}
