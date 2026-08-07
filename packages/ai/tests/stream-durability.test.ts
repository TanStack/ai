import { describe, expect, it, vi } from 'vitest'
import { memoryStream, replayRunStream } from '../src/stream-durability'
import { EventType } from '../src/types'
import { ev } from './test-utils'
import type { StreamChunk } from '../src/types'

function label(chunk: StreamChunk): string {
  return chunk.type === EventType.TEXT_MESSAGE_CONTENT
    ? chunk.delta
    : `[${chunk.type}]`
}

async function readLabels(
  stream: AsyncIterable<{ offset: string; chunk: StreamChunk }>,
): Promise<Array<string>> {
  const labels: Array<string> = []
  for await (const { chunk } of stream) labels.push(label(chunk))
  return labels
}

describe('memoryStream', () => {
  it('returns opaque per-chunk offsets and replays them unchanged', async () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat', { method: 'POST' }),
    )

    expect(durability.resumeFrom()).toBeNull()
    const offsets = await durability.append([
      ev.textContent('a'),
      ev.textContent('b'),
      ev.textContent('c'),
    ])
    expect(offsets).toHaveLength(3)
    expect(new Set(offsets).size).toBe(3)
    await durability.close()

    const replayedOffsets: Array<string> = []
    const replayedLabels: Array<string> = []
    for await (const entry of durability.read('-1')) {
      replayedOffsets.push(entry.offset)
      replayedLabels.push(label(entry.chunk))
    }
    expect(replayedOffsets).toEqual(offsets)
    expect(replayedLabels).toEqual(['a', 'b', 'c'])
  })

  it('resumes strictly after an adapter-owned Last-Event-ID', async () => {
    const producer = memoryStream(
      new Request('https://example.test/api/chat?runId=run-resume', {
        method: 'POST',
      }),
    )
    const offsets = await producer.append([
      ev.textContent('a'),
      ev.textContent('b'),
      ev.textContent('c'),
    ])
    await producer.close()

    const reconnect = memoryStream(
      new Request('https://example.test/api/chat', {
        method: 'POST',
        headers: { 'Last-Event-ID': offsets[1] ?? '' },
      }),
    )
    expect(reconnect.resumeFrom()).toBe(offsets[1])

    const entries = []
    const resumeOffset = reconnect.resumeFrom()
    if (resumeOffset === null) throw new Error('Expected a resume offset')
    for await (const entry of reconnect.read(resumeOffset)) entries.push(entry)
    expect(entries.map((entry) => entry.offset)).toEqual([offsets[2]])
    expect(entries.map((entry) => label(entry.chunk))).toEqual(['c'])
  })

  it('reads an opaque offset from the query string', async () => {
    const producer = memoryStream(
      new Request('https://example.test/api/chat?runId=run-query', {
        method: 'POST',
      }),
    )
    const offsets = await producer.append([
      ev.textContent('x'),
      ev.textContent('y'),
    ])
    await producer.close()

    const joiner = memoryStream(
      new Request(
        `https://example.test/api/chat?offset=${encodeURIComponent(offsets[0] ?? '')}`,
        { method: 'POST' },
      ),
    )
    const resumeOffset = joiner.resumeFrom()
    if (resumeOffset === null) throw new Error('Expected a resume offset')
    expect(await readLabels(joiner.read(resumeOffset))).toEqual(['y'])
  })

  it('reads the producer run id from the X-Run-Id header (client POST path)', async () => {
    // The client sends its chosen run id as a header so the POST URL is
    // byte-identical to a plain request; a from-start join addresses the same
    // run by that id in the query.
    const producer = memoryStream(
      new Request('https://example.test/api/chat', {
        method: 'POST',
        headers: { 'X-Run-Id': 'run-from-header' },
      }),
    )
    await producer.append([ev.textContent('h1'), ev.textContent('h2')])
    await producer.close()

    const joiner = memoryStream(
      new Request(
        'https://example.test/api/chat?runId=run-from-header&offset=-1',
        {
          method: 'GET',
        },
      ),
    )
    expect(await readLabels(joiner.read('-1'))).toEqual(['h1', 'h2'])
  })

  it('prefers the X-Run-Id header over a ?runId query param', async () => {
    const producer = memoryStream(
      new Request('https://example.test/api/chat?runId=from-query', {
        method: 'POST',
        headers: { 'X-Run-Id': 'from-header' },
      }),
    )
    await producer.append([ev.textContent('z')])
    await producer.close()

    const byHeaderId = memoryStream(
      new Request('https://example.test/api/chat?runId=from-header&offset=-1', {
        method: 'GET',
      }),
    )
    expect(await readLabels(byHeaderId.read('-1'))).toEqual(['z'])
  })

  it('live-tails a from-start join through the producer terminal', async () => {
    const producer = memoryStream(
      new Request('https://example.test/api/chat?runId=run-live', {
        method: 'POST',
      }),
    )
    await producer.append([ev.textContent('a'), ev.textContent('b')])

    const joiner = memoryStream(
      new Request('https://example.test/api/chat?runId=run-live&offset=-1', {
        method: 'POST',
      }),
    )
    const resumeOffset = joiner.resumeFrom()
    if (resumeOffset === null) throw new Error('Expected a resume offset')
    const received: Array<string> = []
    const done = (async () => {
      for await (const { chunk } of joiner.read(resumeOffset)) {
        received.push(label(chunk))
      }
    })()

    await new Promise<void>((resolve) => setTimeout(resolve, 10))
    expect(received).toEqual(['a', 'b'])

    await producer.append([ev.textContent('c'), ev.textContent('d')])
    await producer.append([ev.runFinished()])
    // A terminal chunk no longer ends the read; the producer signals completion
    // by closing (an agent-loop run emits a RUN_FINISHED per iteration).
    await producer.close()
    await done
    expect(received).toEqual(['a', 'b', 'c', 'd', '[RUN_FINISHED]'])
  })

  it('tails an agent-loop run across per-iteration terminals to close', async () => {
    // A tool-calling run emits RUN_STARTED/RUN_FINISHED PER iteration. The reader
    // must not stop on the first RUN_FINISHED (finishReason "tool_calls") — it
    // must deliver the tool result and the second iteration's reply, ending only
    // when the producer closes.
    const producer = memoryStream(
      new Request('https://example.test/api/chat?runId=run-agentloop', {
        method: 'POST',
      }),
    )
    const joiner = memoryStream(
      new Request(
        'https://example.test/api/chat?runId=run-agentloop&offset=-1',
        { method: 'POST' },
      ),
    )
    const resumeOffset = joiner.resumeFrom()
    if (resumeOffset === null) throw new Error('Expected a resume offset')
    const received: Array<string> = []
    const done = (async () => {
      for await (const { chunk } of joiner.read(resumeOffset)) {
        received.push(label(chunk))
      }
    })()

    // Iteration 1: a tool call, then a per-iteration terminal.
    await producer.append([ev.textContent('rolling'), ev.runFinished()])
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
    // The first terminal must NOT have ended the reader.
    expect(received).toEqual(['rolling', '[RUN_FINISHED]'])

    // Iteration 2: the tool result feeds back and the model replies, then the
    // producer closes.
    await producer.append([ev.textContent('you rolled a 14'), ev.runFinished()])
    await producer.close()
    await done
    expect(received).toEqual([
      'rolling',
      '[RUN_FINISHED]',
      'you rolled a 14',
      '[RUN_FINISHED]',
    ])
  })

  it('supports an adapter-owned tail sentinel for future writes', async () => {
    const producer = memoryStream(
      new Request('https://example.test/api/chat?runId=run-tail', {
        method: 'POST',
      }),
    )
    await producer.append([ev.textContent('old')])
    const joiner = memoryStream(
      new Request('https://example.test/api/chat?runId=run-tail&offset=now', {
        method: 'POST',
      }),
    )
    const resumeOffset = joiner.resumeFrom()
    if (resumeOffset === null) throw new Error('Expected a resume offset')
    const received: Array<string> = []
    const done = (async () => {
      for await (const { chunk } of joiner.read(resumeOffset)) {
        received.push(label(chunk))
      }
    })()

    await new Promise<void>((resolve) => setTimeout(resolve, 10))
    await producer.append([ev.textContent('new'), ev.runFinished()])
    await producer.close()
    await done
    expect(received).toEqual(['new', '[RUN_FINISHED]'])
  })

  it('ends a parked reader when its signal aborts', async () => {
    const controller = new AbortController()
    const joiner = memoryStream(
      new Request(
        'https://example.test/api/chat?runId=never-produced&offset=-1',
        { method: 'POST' },
      ),
    )
    const resumeOffset = joiner.resumeFrom()
    if (resumeOffset === null) throw new Error('Expected a resume offset')
    const iterated = readLabels(joiner.read(resumeOffset, controller.signal))

    await new Promise<void>((resolve) => setTimeout(resolve, 10))
    controller.abort()
    await expect(iterated).resolves.toEqual([])
  })

  it('fails a from-start join that never receives data before the deadline', async () => {
    const joiner = memoryStream(
      new Request(
        'https://example.test/api/chat?runId=run-no-producer&offset=-1',
        { method: 'POST' },
      ),
      { firstChunkDeadlineMs: 20 },
    )
    const resumeOffset = joiner.resumeFrom()
    if (resumeOffset === null) throw new Error('Expected a resume offset')

    await expect(readLabels(joiner.read(resumeOffset))).rejects.toThrow(
      /produced no data within 20ms/,
    )
  })

  it('defaults the first-chunk deadline to a short 100ms window', async () => {
    // A reload rejoin is the common from-start join; its producer ran in a prior
    // request, so an empty log means the run is gone and should fail fast rather
    // than hang. The default is short so the client re-enables near-instantly.
    const joiner = memoryStream(
      new Request(
        'https://example.test/api/chat?runId=run-default-deadline&offset=-1',
        { method: 'POST' },
      ),
    )
    const resumeOffset = joiner.resumeFrom()
    if (resumeOffset === null) throw new Error('Expected a resume offset')

    await expect(readLabels(joiner.read(resumeOffset))).rejects.toThrow(
      /produced no data within 100ms/,
    )
  })

  it('does not apply the first-chunk deadline once a run has produced data', async () => {
    const producer = memoryStream(
      new Request('https://example.test/api/chat?runId=run-slow-tail', {
        method: 'POST',
      }),
    )
    await producer.append([ev.textContent('a')])

    const joiner = memoryStream(
      new Request(
        'https://example.test/api/chat?runId=run-slow-tail&offset=-1',
        {
          method: 'POST',
        },
      ),
      { firstChunkDeadlineMs: 20 },
    )
    const resumeOffset = joiner.resumeFrom()
    if (resumeOffset === null) throw new Error('Expected a resume offset')

    const received: Array<string> = []
    const done = (async () => {
      for await (const { chunk } of joiner.read(resumeOffset)) {
        received.push(label(chunk))
      }
    })()

    // Well past the 20ms first-chunk deadline: a caught-up reader keeps parking
    // because the run already produced data.
    await new Promise<void>((resolve) => setTimeout(resolve, 60))
    expect(received).toEqual(['a'])

    await producer.append([ev.textContent('b'), ev.runFinished()])
    await producer.close()
    await done
    expect(received).toEqual(['a', 'b', '[RUN_FINISHED]'])
  })

  it('fails a resume of an evicted run rather than hanging', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    try {
      const producer = memoryStream(
        new Request('https://example.test/api/chat?runId=run-evictable', {
          method: 'POST',
        }),
      )
      const offsets = await producer.append([ev.textContent('a')])
      await producer.append([ev.runFinished()])
      await producer.close()
      const resumeFrom = offsets[0]
      if (resumeFrom === undefined) throw new Error('Expected an offset')

      // Within the grace window the completed run still resumes.
      const early = memoryStream(
        new Request('https://example.test/api/chat?runId=run-evictable', {
          method: 'POST',
          headers: { 'Last-Event-ID': resumeFrom },
        }),
      )
      expect(await readLabels(early.read(resumeFrom))).toEqual([
        '[RUN_FINISHED]',
      ])

      // Past the grace window, creating a new log sweeps the completed one, and
      // resuming the evicted run surfaces an error instead of parking.
      vi.setSystemTime(6 * 60_000)
      await memoryStream(
        new Request('https://example.test/api/chat?runId=run-sweep-trigger', {
          method: 'POST',
        }),
      ).append([ev.textContent('x')])
      const late = memoryStream(
        new Request('https://example.test/api/chat?runId=run-evictable', {
          method: 'POST',
          headers: { 'Last-Event-ID': resumeFrom },
        }),
      )
      await expect(readLabels(late.read(resumeFrom))).rejects.toThrow(
        /Unknown or expired memory stream run/,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects invalid run ids and offsets loudly', () => {
    expect(() =>
      memoryStream(
        new Request(
          `https://example.test/api/chat?runId=${encodeURIComponent('evil\ninjected')}`,
          { method: 'POST' },
        ),
      ),
    ).toThrow(/Invalid runId/)

    expect(() =>
      memoryStream(
        new Request('https://example.test/api/chat', {
          method: 'POST',
          headers: { 'Last-Event-ID': 'another-backend:cursor' },
        }),
      ),
    ).toThrow(/Invalid memory stream offset/)
  })

  it('attaches to a run by explicit init, without a Request (server-function join path)', async () => {
    const producer = memoryStream({ runId: 'run-init' })
    expect(producer.resumeFrom()).toBeNull()
    const offsets = await producer.append([
      ev.textContent('a'),
      ev.textContent('b'),
    ])
    await producer.close()

    const joiner = memoryStream({ runId: 'run-init' })
    expect(await readLabels(joiner.read('-1'))).toEqual(['a', 'b'])

    const resumer = memoryStream({ runId: 'run-init', offset: offsets[0] })
    expect(resumer.resumeFrom()).toBe(offsets[0])
    expect(await readLabels(resumer.read(offsets[0] ?? ''))).toEqual(['b'])
  })

  it('rejects an invalid explicit run id', () => {
    expect(() => memoryStream({ runId: 'evil\ninjected' })).toThrow(
      /Invalid runId/,
    )
    expect(() => memoryStream({ runId: '' })).toThrow(/Invalid runId/)
  })
})

describe('replayRunStream', () => {
  it('maps a durability read to a bare chunk stream from the start', async () => {
    const producer = memoryStream({ runId: 'run-replay' })
    await producer.append([
      ev.textContent('a'),
      ev.textContent('b'),
      ev.textContent('c'),
    ])
    await producer.close()

    const chunks: Array<StreamChunk> = []
    for await (const chunk of replayRunStream(
      memoryStream({ runId: 'run-replay' }),
    )) {
      chunks.push(chunk)
    }
    expect(chunks.map(label)).toEqual(['a', 'b', 'c'])
  })

  it('honors an explicit resume offset', async () => {
    const producer = memoryStream({ runId: 'run-replay-offset' })
    const offsets = await producer.append([
      ev.textContent('a'),
      ev.textContent('b'),
    ])
    await producer.close()

    const labels: Array<string> = []
    for await (const chunk of replayRunStream(
      memoryStream({ runId: 'run-replay-offset' }),
      offsets[0],
    )) {
      labels.push(label(chunk))
    }
    expect(labels).toEqual(['b'])
  })
})

/**
 * Resolves to {@link TAILED} after a `setTimeout(…, 0)`. Racing a snapshot
 * against this is the regression guard the snapshot tests need: `snapshot` must
 * settle in a microtask, so it always beats a zero-delay timer, while ANY
 * implementation that parks — on a waiter, a deadline, a poll — loses the race
 * and fails the assertion instead of hanging the suite.
 */
const TAILED = Symbol('snapshot tailed instead of returning')

function tailSentinel(): Promise<typeof TAILED> {
  return new Promise((resolve) => setTimeout(() => resolve(TAILED), 0))
}

function snapshotWithoutTailing(
  durability: ReturnType<typeof memoryStream>,
): Promise<Array<{ offset: string; chunk: StreamChunk }> | typeof TAILED> {
  return Promise.race([durability.snapshot(), tailSentinel()])
}

// Every case needs its own runId: memoryStream keys its log map at module scope,
// so a reused id silently inherits another test's entries.
describe('memoryStream snapshot', () => {
  it('resolves to an empty array for an unknown run instead of throwing', async () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat?runId=run-snapshot-unknown', {
        method: 'POST',
      }),
    )

    // read('-1') on this same empty run is the trap snapshot must not fall
    // into: it creates a phantom log and rejects after the first-chunk deadline.
    await expect(snapshotWithoutTailing(durability)).resolves.toEqual([])
  })

  it('returns every stored entry in order at the offsets append minted', async () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat?runId=run-snapshot-order', {
        method: 'POST',
      }),
    )
    const first = await durability.append([
      ev.textContent('a'),
      ev.textContent('b'),
    ])
    const second = await durability.append([ev.textContent('c')])

    const entries = await durability.snapshot()
    expect(entries.map((entry) => entry.offset)).toEqual([...first, ...second])
    expect(entries.map((entry) => label(entry.chunk))).toEqual(['a', 'b', 'c'])
  })

  it('returns while the log is still open and never tails', async () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat?runId=run-snapshot-open', {
        method: 'POST',
      }),
    )
    const chunkA = ev.textContent('a')
    const offsets = await durability.append([chunkA])

    // No close() — this is the whole point. A takeover inspects a log whose
    // producer died, so the log is open by definition and read() would park.
    const entries = await snapshotWithoutTailing(durability)
    expect(entries).not.toBe(TAILED)
    expect(entries).toEqual([{ offset: offsets[0], chunk: chunkA }])

    // A later append is visible to the NEXT snapshot: the result is a
    // point-in-time view, not a subscription.
    const more = await durability.append([ev.textContent('b')])
    expect((await durability.snapshot()).map((entry) => entry.offset)).toEqual([
      ...offsets,
      ...more,
    ])
  })

  it('still returns the entries after close', async () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat?runId=run-snapshot-closed', {
        method: 'POST',
      }),
    )
    const chunks = [ev.textContent('a'), ev.textContent('b')]
    const offsets = await durability.append(chunks)
    await durability.close()

    const entries = await snapshotWithoutTailing(durability)
    expect(entries).not.toBe(TAILED)
    expect(entries).toEqual([
      { offset: offsets[0], chunk: chunks[0] },
      { offset: offsets[1], chunk: chunks[1] },
    ])
  })

  it('returns a copy the caller cannot reach the stored log through', async () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat?runId=run-snapshot-copy', {
        method: 'POST',
      }),
    )
    const offsets = await durability.append([
      ev.textContent('a'),
      ev.textContent('b'),
    ])
    await durability.close()

    const mutated = await durability.snapshot()
    mutated.length = 0
    mutated.push({ offset: 'forged', chunk: ev.textContent('z') })
    const alsoMutated = await durability.snapshot()
    const target = alsoMutated[0]
    if (!target) throw new Error('Expected a stored entry')
    target.offset = 'clobbered'

    expect((await durability.snapshot()).map((entry) => entry.offset)).toEqual(
      offsets,
    )
    expect(await readLabels(durability.read('-1'))).toEqual(['a', 'b'])
  })
})
