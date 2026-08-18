import { describe, expect, it } from 'vitest'
import { EventType, memoryStream } from '../src/index'
import type { StreamChunk } from '../src/index'

function chunk(delta: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm1',
    delta,
    content: delta,
    timestamp: 1,
  }
}

function producerRequest(runId: string): Request {
  return new Request(`http://test.local/api/chat?runId=${runId}`, {
    method: 'POST',
  })
}

function joinRequest(runId: string): Request {
  return new Request(`http://test.local/api/chat?runId=${runId}&offset=-1`, {
    method: 'GET',
  })
}

function resumeRequest(offset: string): Request {
  return new Request('http://test.local/api/chat', {
    method: 'GET',
    headers: { 'Last-Event-ID': offset },
  })
}

async function readAll(
  durability: ReturnType<typeof memoryStream>,
  from: string,
): Promise<Array<string>> {
  const seen: Array<string> = []
  for await (const event of durability.read(from)) {
    if ('delta' in event.chunk && typeof event.chunk.delta === 'string') {
      seen.push(event.chunk.delta)
    }
  }
  return seen
}

/** Index an array without a non-null assertion (oxlint forbids `!`). */
function nth(values: Array<string>, index: number): string {
  const value = values[index]
  if (value === undefined) {
    throw new Error(`expected an offset at index ${index}`)
  }
  return value
}

/** Replay a completed run from the start, via a fresh joiner. */
function replay(runId: string): Promise<Array<string>> {
  return readAll(memoryStream(joinRequest(runId)), '-1')
}

describe('upsert', () => {
  it('returns the supplied offsets, in order', async () => {
    const producer = memoryStream(producerRequest('u-verbatim'))
    const seeded = await producer.append([chunk('a'), chunk('b')])
    const offsets = await producer.upsert([
      { chunk: chunk('a'), offset: nth(seeded, 0) },
      { chunk: chunk('b'), offset: nth(seeded, 1) },
    ])
    expect(offsets).toEqual(seeded)
  })

  it('is idempotent: re-upserting an already-stored range does not duplicate', async () => {
    const producer = memoryStream(producerRequest('u-idem'))
    const seeded = await producer.append([chunk('a'), chunk('b'), chunk('c')])

    // A successor host re-translates the SAME journal bytes it already sent.
    await producer.upsert([
      { chunk: chunk('a'), offset: nth(seeded, 0) },
      { chunk: chunk('b'), offset: nth(seeded, 1) },
      { chunk: chunk('c'), offset: nth(seeded, 2) },
    ])
    await producer.close()

    expect(await replay('u-idem')).toEqual(['a', 'b', 'c'])
  })

  it('handles a partially overlapping batch: known offsets replace, new ones append', async () => {
    const producer = memoryStream(producerRequest('u-overlap'))
    const seeded = await producer.append([chunk('a'), chunk('b')])
    const nextOffset = 'memory:v1:u-overlap:3'

    await producer.upsert([
      // Overlap: already stored, must replace in place.
      { chunk: chunk('b'), offset: nth(seeded, 1) },
      // New: must land after everything stored.
      { chunk: chunk('c'), offset: nextOffset },
    ])
    await producer.close()

    expect(await replay('u-overlap')).toEqual(['a', 'b', 'c'])
  })

  it('replaces the stored chunk at an existing offset rather than appending it', async () => {
    const producer = memoryStream(producerRequest('u-replace'))
    const seeded = await producer.append([chunk('a'), chunk('stale')])
    await producer.upsert([{ chunk: chunk('fresh'), offset: nth(seeded, 1) }])
    await producer.close()

    expect(await replay('u-replace')).toEqual(['a', 'fresh'])
  })

  it('rejects an offset repeated within one batch and leaves the log unmutated', async () => {
    const producer = memoryStream(producerRequest('u-dup'))
    await producer.append([chunk('a')])
    const dup = 'memory:v1:u-dup:2'

    await expect(
      producer.upsert([
        { chunk: chunk('b'), offset: dup },
        { chunk: chunk('c'), offset: dup },
      ]),
    ).rejects.toThrow(/repeated within the batch/)

    await producer.close()
    // Neither `b` nor `c` may have landed — a rejected upsert must not partially
    // apply, otherwise a retrying caller cannot know a prefix was stored.
    expect(await replay('u-dup')).toEqual(['a'])
  })

  it('rejects a sparse entries array and leaves the log unmutated', async () => {
    // `Array.prototype.map` SKIPS holes, so planning with it would leave the
    // plan short and let the apply loop read `undefined` partway through, after
    // earlier steps had already mutated the log. The plan must therefore be
    // built with something that visits every index. Do not "simplify" the
    // planning step back to `entries.map`.
    //
    // NB: `memoryStream` keys its log map by runId at module scope, so every
    // case in this file needs its OWN runId. Reusing one silently inherits the
    // other's entries.
    const producer = memoryStream(producerRequest('u-hole'))
    await producer.append([chunk('a')])

    const sparse: Array<{ chunk: StreamChunk; offset: string }> = []
    sparse[0] = { chunk: chunk('b'), offset: 'memory:v1:u-hole:2' }
    sparse[2] = { chunk: chunk('d'), offset: 'memory:v1:u-hole:4' }

    await expect(producer.upsert(sparse)).rejects.toThrow(/entries\[1\]/)

    await producer.close()
    // `b` sits at index 0, BEFORE the hole. If planning and applying were
    // interleaved it would already be stored when the hole threw.
    expect(await replay('u-hole')).toEqual(['a'])
  })

  it('rejects a duplicate of an ALREADY-STORED offset instead of silently dropping a chunk', async () => {
    // The dangerous shape of finding 1: without an intra-batch duplicate check
    // both entries take the replace path, the second overwrites the first, and
    // `b` vanishes with no error at all.
    const producer = memoryStream(producerRequest('u-dup-stored'))
    const seeded = await producer.append([chunk('a')])

    await expect(
      producer.upsert([
        { chunk: chunk('b'), offset: nth(seeded, 0) },
        { chunk: chunk('c'), offset: nth(seeded, 0) },
      ]),
    ).rejects.toThrow(/repeated within the batch/)

    await producer.close()
    expect(await replay('u-dup-stored')).toEqual(['a'])
  })

  it('rejects a foreign-format offset and leaves the log unmutated', async () => {
    const producer = memoryStream(producerRequest('u-format'))
    await producer.append([chunk('a')])

    await expect(
      producer.upsert([
        { chunk: chunk('b'), offset: 'memory:v1:u-format:2' },
        { chunk: chunk('c'), offset: 'sbx:v1:u-format:0:0' },
      ]),
    ).rejects.toThrow(/not a resumable memory stream offset/)

    await producer.close()
    expect(await replay('u-format')).toEqual(['a'])
  })

  it("rejects an offset decoding to a different run's id and leaves the log unmutated", async () => {
    const producer = memoryStream(producerRequest('u-foreign-run'))
    await producer.append([chunk('a')])

    await expect(
      producer.upsert([
        { chunk: chunk('b'), offset: 'memory:v1:u-foreign-run:2' },
        { chunk: chunk('c'), offset: 'memory:v1:some-other-run:3' },
      ]),
    ).rejects.toThrow(/belongs to run "some-other-run"/)

    await producer.close()
    expect(await replay('u-foreign-run')).toEqual(['a'])
  })

  it('rejects a not-yet-stored offset that claims a position at or before the tail', async () => {
    const producer = memoryStream(producerRequest('u-backfill'))
    await producer.upsert([
      { chunk: chunk('a'), offset: 'memory:v1:u-backfill:10' },
      { chunk: chunk('b'), offset: 'memory:v1:u-backfill:20' },
    ])

    // Position 15 falls in the gap: not stored, yet behind the tail. Pushing it
    // would break the monotonic-seq ordering `read()` relies on when it walks
    // `entries` in array order, so it must be refused.
    await expect(
      producer.upsert([
        { chunk: chunk('x'), offset: 'memory:v1:u-backfill:15' },
      ]),
    ).rejects.toThrow(/at or before the tail/)

    await producer.close()
    expect(await replay('u-backfill')).toEqual(['a', 'b'])
  })

  it('returns offsets that are actually resumable: reading from one replays exactly what follows', async () => {
    const producer = memoryStream(producerRequest('u-resume'))
    const returned = await producer.upsert([
      { chunk: chunk('a'), offset: 'memory:v1:u-resume:1' },
      { chunk: chunk('b'), offset: 'memory:v1:u-resume:2' },
    ])
    await producer.append([chunk('c')])
    await producer.close()

    // The offset came back from `upsert`; a reconnecting browser hands it
    // straight back as Last-Event-ID. Constructing the stream must not throw,
    // and the replay must contain only what follows that offset.
    const resumed = memoryStream(resumeRequest(nth(returned, 0)))
    expect(resumed.resumeFrom()).toBe('memory:v1:u-resume:1')
    expect(await readAll(resumed, nth(returned, 0))).toEqual(['b', 'c'])

    expect(
      await readAll(
        memoryStream(resumeRequest(nth(returned, 1))),
        nth(returned, 1),
      ),
    ).toEqual(['c'])
  })

  it('keeps sparse, non-contiguous seqs resumable', async () => {
    // Nothing depends on seq density, only on strict monotonicity. A caller
    // deriving offsets from a source position naturally leaves gaps.
    const producer = memoryStream(producerRequest('u-sparse'))
    const returned = await producer.upsert([
      { chunk: chunk('a'), offset: 'memory:v1:u-sparse:5' },
      { chunk: chunk('b'), offset: 'memory:v1:u-sparse:40' },
      { chunk: chunk('c'), offset: 'memory:v1:u-sparse:900' },
    ])
    await producer.close()

    expect(await replay('u-sparse')).toEqual(['a', 'b', 'c'])
    expect(
      await readAll(
        memoryStream(resumeRequest(nth(returned, 1))),
        nth(returned, 1),
      ),
    ).toEqual(['c'])
  })
})

describe('append (no supplied offsets)', () => {
  it('assigns one resumable offset per chunk, in order', async () => {
    const producer = memoryStream(producerRequest('a-auto'))
    const offsets = await producer.append([chunk('a'), chunk('b')])
    expect(offsets).toHaveLength(2)
    expect(offsets).toEqual(['memory:v1:a-auto:1', 'memory:v1:a-auto:2'])
  })

  it('appends across calls without duplicating', async () => {
    const producer = memoryStream(producerRequest('a-seq'))
    await producer.append([chunk('a')])
    await producer.append([chunk('b'), chunk('c')])
    await producer.close()

    expect(await replay('a-seq')).toEqual(['a', 'b', 'c'])
  })
})
