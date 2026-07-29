/**
 * Replay-from-zero with log alignment: the mechanism that makes a resumed
 * journal read idempotent.
 *
 * A host translates journal bytes 0..1000 and appends the resulting chunks, then
 * dies. A successor re-reads the journal **from byte 0** and re-translates it,
 * producing the same chunks again. This transform reads what is already in the
 * event log, verifies that the replay reproduces it, suppresses that prefix, and
 * passes only the remainder downstream to be appended.
 *
 * Why this shape rather than the offset-upsert the design sketched:
 *
 * - `StreamDurability.append` does not accept caller-supplied offsets, and
 *   `UpsertableStreamDurability.upsert` is deliberately **not** used here:
 *   `memoryStream.upsert` rejects any offset it did not mint itself, and
 *   `durableStream` has no `upsert` at all (its offsets embed a
 *   backend-assigned cursor). The journal path therefore only ever *appends*,
 *   and this function's whole job is deciding where that append starts. Do not
 *   "simplify" it into an `upsert` — the recommended production adapter cannot
 *   accept one.
 * - Even if it could, re-translation is only reproducible because
 *   `createRunScopedIdGen` makes it so. The dedupe boundary therefore has to be
 *   *derived from the log*, not tracked beside it — which also means there is no
 *   window in which a checkpoint and the log can disagree, because the log is
 *   the checkpoint.
 * - The log stays append-only with strictly increasing offsets. That is what
 *   `durableStream`'s backend enforces and what the client's offset de-dup
 *   (`ai-client`'s `seen` set) relies on — the client is NOT tolerant of a
 *   duplicated text or tool-argument delta.
 *
 * Divergence is a bug, not a condition to recover from, so it throws.
 */
import { EventType } from '@tanstack/ai'
import { chunkFingerprint } from './chunk-identity'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { StreamChunk, StreamDurability } from '@tanstack/ai'

/**
 * Default bound on consecutive stored chunks alignment will skip as out-of-band.
 *
 * A bound is what keeps this a tolerance rather than a search. Unbounded, a
 * genuine determinism regression would make alignment scan forward through the
 * whole log looking for a fingerprint that happens to match, suppress
 * everything it passed, and deliver a stream whose prefix and suffix disagree —
 * the exact failure {@link JournalReplayDivergedError} exists to prevent. 64 is
 * well above any realistic burst of bridged console events between two
 * translated chunks and well below a log length where a false match becomes
 * plausible.
 */
export const DEFAULT_MAX_OUT_OF_BAND_SKIP = 64

/**
 * The out-of-band predicate for the harness adapters.
 *
 * `ai-codex` and `ai-claude-code` splice `createBridgeEventChannel`'s stream
 * into their translated output with `mergeChunkStreams`. That channel is the
 * only producer on the path and it emits exclusively `EventType.CUSTOM` chunks
 * (`bridge-events.ts:53-63`), fired by LIVE bridged-tool execution. A replay
 * runs no tools, so those chunks exist in the log and not in the replay.
 *
 * Structural rather than a list of event names on purpose: a new bridged tool
 * inventing a new `name` must not silently reintroduce the divergence.
 */
export function isBridgeCustomChunk(chunk: StreamChunk): boolean {
  return chunk.type === EventType.CUSTOM
}

/**
 * The replay produced a different chunk than the log already holds at that
 * index. Means translation stopped being deterministic — a `genId` that is not
 * run-scoped, a translator that consults the clock, or a journal that was
 * rewritten. Fail loud: suppressing the mismatch would deliver a stream whose
 * prefix and suffix disagree about message identity.
 */
export class JournalReplayDivergedError extends Error {
  constructor(
    readonly index: number,
    readonly stored: string,
    readonly replayed: string,
  ) {
    super(
      `journal replay diverged at index ${index}: stored ${stored} but replayed ${replayed}`,
    )
    this.name = 'JournalReplayDivergedError'
  }
}

export interface AlignToStoredLogOptions {
  /** The run's event log. Read from the beginning; never written here. */
  durability: StreamDurability
  /** Optional sink for the alignment summary. */
  logger?: InternalLogger
  /**
   * Recognizes a stored chunk that the replay CANNOT reproduce, so alignment
   * skips it instead of throwing.
   *
   * Absent by default, which keeps strict positional comparison: any stored
   * chunk the replay does not produce is a determinism bug and fails loudly.
   * Pass {@link isBridgeCustomChunk} on the harness attach path, where the
   * previous host spliced live bridged-tool events into the log.
   *
   * The predicate is applied to the STORED chunk, never to the replayed one. A
   * skipped entry is suppressed, not re-appended, so the client's view is
   * unchanged: it already received that chunk under its own offset.
   */
  isOutOfBand?: (chunk: StreamChunk) => boolean
  /**
   * Maximum CONSECUTIVE stored chunks that may be skipped as out-of-band before
   * alignment gives up. Reset by every match. Defaults to
   * {@link DEFAULT_MAX_OUT_OF_BAND_SKIP}. Ignored when `isOutOfBand` is absent.
   */
  maxOutOfBandSkip?: number
}

/**
 * Suppress the chunks already present in the event log and yield the rest.
 *
 * The stored prefix is read exactly once, eagerly, before the first replay
 * chunk is pulled. Both halves of that matter:
 *
 * - **Exactly once**, because a second read mid-stream would race the appends
 *   the caller is making downstream of this transform and could classify a
 *   chunk this very run just appended as an already-stored one, dropping it.
 * - **Via `snapshot()`, never `read()`**. `read` *tails*: it returns only when
 *   the log is terminalized with `close()` or the caller aborts. A takeover's
 *   log is open by definition — the host that would have closed it is the host
 *   that died — so `for await (… of read('-1'))` would never finish, and on an
 *   empty log `memoryStream` rejects a from-start join outright once its
 *   first-chunk deadline elapses. `snapshot()` is the bounded read: it resolves
 *   with what is stored right now, including while the log is still open, and
 *   resolves to `[]` for a run with nothing stored.
 */
export async function* alignToStoredLog(
  chunks: AsyncIterable<StreamChunk>,
  options: AlignToStoredLogOptions,
): AsyncIterable<StreamChunk> {
  const entries = await options.durability.snapshot()
  const stored = entries.map((entry) => chunkFingerprint(entry.chunk))

  const isOutOfBand = options.isOutOfBand
  const maxSkip = options.maxOutOfBandSkip ?? DEFAULT_MAX_OUT_OF_BAND_SKIP

  let cursor = 0
  let suppressed = 0
  let skipped = 0
  let forwarded = 0

  for await (const chunk of chunks) {
    // Past the end of the stored log: everything from here is new.
    if (cursor >= stored.length) {
      forwarded += 1
      yield chunk
      continue
    }

    const actual = chunkFingerprint(chunk)
    let consecutiveSkips = 0
    for (;;) {
      // `entries` and `stored` are the same length by construction; both are
      // bound because the predicate needs the CHUNK while the comparison needs
      // its fingerprint.
      const entry = entries[cursor]
      const expected = stored[cursor]
      if (entry === undefined || expected === undefined) {
        forwarded += 1
        yield chunk
        break
      }
      if (expected === actual) {
        cursor += 1
        suppressed += 1
        break
      }
      // Mismatch. Only a stored chunk the replay provably cannot reproduce may
      // be skipped, and only `maxSkip` of them in a row.
      if (isOutOfBand === undefined || !isOutOfBand(entry.chunk)) {
        throw new JournalReplayDivergedError(cursor, expected, actual)
      }
      if (consecutiveSkips >= maxSkip) {
        throw new JournalReplayDivergedError(cursor, expected, actual)
      }
      cursor += 1
      consecutiveSkips += 1
      skipped += 1
    }
  }

  // Trailing stored entries. Out-of-band ones are expected (a bridged tool's
  // last event lands after the final translated chunk); anything else means the
  // journal no longer accounts for chunks the log already delivered, which
  // nothing downstream can repair.
  while (cursor < stored.length) {
    const entry = entries[cursor]
    if (
      entry === undefined ||
      isOutOfBand === undefined ||
      !isOutOfBand(entry.chunk)
    ) {
      throw new Error(
        `journal replay is shorter than the stored log: ${stored.length - cursor} stored chunk(s) from index ${cursor} were not reproduced`,
      )
    }
    cursor += 1
    skipped += 1
  }

  options.logger?.provider(
    `journal alignment: suppressed ${suppressed} stored chunk(s), skipped ${skipped} out-of-band, forwarded ${forwarded}`,
    { suppressed, skipped, forwarded },
  )
}
