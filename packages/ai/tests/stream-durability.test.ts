import { describe, expect, it } from 'vitest'
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
