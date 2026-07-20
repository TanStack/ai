import { describe, expect, it, vi } from 'vitest'
import { memoryStream } from '../src/stream-durability'
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
      new Request('https://example.test/api/chat?runId=run-from-header&offset=-1', {
        method: 'GET',
      }),
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
    await done
    expect(received).toEqual(['a', 'b', 'c', 'd', '[RUN_FINISHED]'])
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
})
