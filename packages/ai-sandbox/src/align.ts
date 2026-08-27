import { EventType } from '@tanstack/ai'
import {
  chunkFingerprint,
  chunkFingerprintIgnoringThreadId,
  chunkThreadId,
} from './chunk-identity'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { StreamChunk, StreamDurability } from '@tanstack/ai'

export const DEFAULT_MAX_OUT_OF_BAND_SKIP = 64

export function isBridgeCustomChunk(chunk: StreamChunk): boolean {
  return chunk.type === EventType.CUSTOM
}

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

export class JournalReplayThreadIdMismatchError extends JournalReplayDivergedError {
  constructor(
    index: number,
    stored: string,
    replayed: string,
    readonly storedThreadId: string | undefined,
    readonly replayedThreadId: string | undefined,
  ) {
    super(index, stored, replayed)
    this.name = 'JournalReplayThreadIdMismatchError'
    this.message =
      `journal replay diverged at index ${index} ONLY by threadId: stored ${JSON.stringify(storedThreadId)} but replayed ${JSON.stringify(replayedThreadId)}. ` +
      `Every other field of the chunk is identical, so the agent did NOT behave differently — the attaching run generated a new threadId instead of reusing the run record's. ` +
      `Pass the run record's threadId (RunRecord.threadId, which sandboxRunDriver hands to drive({ runId, threadId, signal })) into chat() on the attach route; ` +
      `without it the adapter falls back to generateId() and every chunk carries an id the stored log cannot match.`
  }
}

function divergenceError(
  index: number,
  storedChunk: StreamChunk,
  replayedChunk: StreamChunk,
  stored: string,
  replayed: string,
): JournalReplayDivergedError {
  const storedThreadId = chunkThreadId(storedChunk)
  const replayedThreadId = chunkThreadId(replayedChunk)
  const isThreadIdOnlyMismatch =
    storedThreadId !== replayedThreadId &&
    chunkFingerprintIgnoringThreadId(storedChunk) ===
      chunkFingerprintIgnoringThreadId(replayedChunk)
  if (isThreadIdOnlyMismatch) {
    return new JournalReplayThreadIdMismatchError(
      index,
      stored,
      replayed,
      storedThreadId,
      replayedThreadId,
    )
  }
  return new JournalReplayDivergedError(index, stored, replayed)
}

export interface AlignToStoredLogOptions<TOffset extends string = string> {
  durability: Pick<StreamDurability<TOffset>, 'snapshot'>
  /** Optional sink for the alignment summary. */
  logger?: InternalLogger
  isOutOfBand?: (chunk: StreamChunk) => boolean
  maxOutOfBandSkip?: number
}

export async function* alignToStoredLog<TOffset extends string = string>(
  chunks: AsyncIterable<StreamChunk>,
  options: AlignToStoredLogOptions<TOffset>,
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
      const entry = entries[cursor]
      const expected = stored[cursor]
      const isMissingAlignPair = entry === undefined || expected === undefined
      if (isMissingAlignPair) {
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
      const isInBandReplayChunk =
        isOutOfBand === undefined || !isOutOfBand(entry.chunk)
      if (isInBandReplayChunk) {
        throw divergenceError(cursor, entry.chunk, chunk, expected, actual)
      }
      if (consecutiveSkips >= maxSkip) {
        throw divergenceError(cursor, entry.chunk, chunk, expected, actual)
      }
      cursor += 1
      consecutiveSkips += 1
      skipped += 1
    }
  }

  while (cursor < stored.length) {
    const entry = entries[cursor]
    const isMissingOutOfBandTail =
      entry === undefined ||
      isOutOfBand === undefined ||
      !isOutOfBand(entry.chunk)
    if (isMissingOutOfBandTail) {
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
