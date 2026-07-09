import { describe, expect, it, vi } from 'vitest'
import { encodeOffset, memoryStream } from '../src/stream-durability'
import { toServerSentEventsResponse } from '../src/stream-to-response'
import type { StreamChunk } from '../src/types'

function textChunk(delta: string): StreamChunk {
  return { type: 'TEXT_MESSAGE_CONTENT', delta, timestamp: 0 } as StreamChunk
}

function fiveChunkStream(): { stream: AsyncIterable<StreamChunk>; iterated: () => boolean } {
  let started = false
  const stream: AsyncIterable<StreamChunk> = {
    async *[Symbol.asyncIterator]() {
      started = true
      for (const d of ['1', '2', '3', '4', '5']) {
        yield textChunk(d)
      }
    },
  }
  return { stream, iterated: () => started }
}

async function readBody(res: Response): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value)
  }
  return out
}

function parseSseEvents(
  body: string,
): Array<{ id?: string; data: string }> {
  return body
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split('\n')
      const idLine = lines.find((l) => l.startsWith('id: '))
      const dataLine = lines.find((l) => l.startsWith('data: '))
      return {
        ...(idLine ? { id: idLine.slice('id: '.length) } : {}),
        data: dataLine ? dataLine.slice('data: '.length) : '',
      }
    })
}

describe('toServerSentEventsResponse with durability', () => {
  it('appends + forwards a fresh run, tagging each event with an id offset', async () => {
    const request = new Request('https://example.test/api/chat', {
      method: 'POST',
    })
    const durability = memoryStream(request)
    const runId = durability.runId()
    const { stream, iterated } = fiveChunkStream()

    const res = toServerSentEventsResponse(stream, { durability })
    const events = parseSseEvents(await readBody(res))

    expect(iterated()).toBe(true)
    expect(events).toHaveLength(5)
    expect(events.map((e) => e.id)).toEqual([
      encodeOffset(runId, 1),
      encodeOffset(runId, 2),
      encodeOffset(runId, 3),
      encodeOffset(runId, 4),
      encodeOffset(runId, 5),
    ])

    // The durability log now holds all 5 chunks.
    const logged: Array<string> = []
    for await (const { chunk } of durability.read('-1')) {
      logged.push((chunk as { delta: string }).delta)
    }
    expect(logged).toEqual(['1', '2', '3', '4', '5'])
  })

  it('replays from the log on resume and never iterates the input stream', async () => {
    // Produce a run under a known id.
    const producerReq = new Request(
      'https://example.test/api/chat?runId=run-x',
      { method: 'POST' },
    )
    const { stream } = fiveChunkStream()
    await readBody(
      toServerSentEventsResponse(stream, { durability: memoryStream(producerReq) }),
    )

    // Reconnect carrying Last-Event-ID at seq 2.
    const reconnectReq = new Request('https://example.test/api/chat', {
      method: 'POST',
      headers: { 'Last-Event-ID': encodeOffset('run-x', 2) },
    })
    const exploding: AsyncIterable<StreamChunk> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            throw new Error('input stream must not be iterated on resume')
          },
        }
      },
    }

    const res = toServerSentEventsResponse(exploding, {
      durability: memoryStream(reconnectReq),
    })
    const events = parseSseEvents(await readBody(res))

    expect(events.map((e) => e.id)).toEqual([
      encodeOffset('run-x', 3),
      encodeOffset('run-x', 4),
      encodeOffset('run-x', 5),
    ])
    expect(events.map((e) => JSON.parse(e.data).delta)).toEqual(['3', '4', '5'])
  })

  it('batches appends to at most `batch` chunks', async () => {
    const request = new Request('https://example.test/api/chat?runId=run-b', {
      method: 'POST',
    })
    const durability = memoryStream(request)
    const appendSpy = vi.spyOn(durability, 'append')
    const { stream } = fiveChunkStream()

    await readBody(toServerSentEventsResponse(stream, { durability, batch: 2 }))

    const batchSizes = appendSpy.mock.calls.map(([chunks]) => chunks.length)
    expect(batchSizes.every((n) => n <= 2)).toBe(true)
    expect(batchSizes.reduce((a, b) => a + b, 0)).toBe(5)
  })

  // Finding 7a: a non-positive-integer batch is rejected loudly (a NaN used to
  // silently disable size-based flushing: `length >= NaN` is always false).
  it('rejects a non-positive-integer batch size', () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat?runId=run-bad-batch', {
        method: 'POST',
      }),
    )
    const { stream } = fiveChunkStream()
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(() =>
        toServerSentEventsResponse(stream, { durability, batch: bad }),
      ).toThrow(/Invalid durability batch size/)
    }
    // A valid positive integer is accepted.
    expect(() =>
      toServerSentEventsResponse(stream, { durability, batch: 4 }),
    ).not.toThrow()
  })

  // Finding 4: when the provider stream throws, a terminal RUN_ERROR must be
  // persisted to the durability log, so a later reader / join learns the run
  // failed instead of finding a log with no terminal.
  it('persists a terminal RUN_ERROR to the log when the stream throws', async () => {
    const request = new Request('https://example.test/api/chat?runId=run-err', {
      method: 'POST',
    })
    const durability = memoryStream(request)

    const throwing: AsyncIterable<StreamChunk> = {
      async *[Symbol.asyncIterator]() {
        yield textChunk('1')
        throw new Error('provider exploded')
      },
    }

    // The live consumer still sees a RUN_ERROR (emitted by the transport).
    const liveEvents = parseSseEvents(
      await readBody(toServerSentEventsResponse(throwing, { durability })),
    )
    const liveTypes = liveEvents.map((e) => JSON.parse(e.data).type)
    expect(liveTypes).toContain('RUN_ERROR')

    // A second reader / joiner replaying the log sees the persisted terminal.
    const joiner = memoryStream(
      new Request('https://example.test/api/chat?runId=run-err', {
        method: 'POST',
      }),
    )
    const logged: Array<StreamChunk> = []
    for await (const { chunk } of joiner.read('-1')) {
      logged.push(chunk)
    }
    expect(logged.map((c) => c.type)).toEqual([
      'TEXT_MESSAGE_CONTENT',
      'RUN_ERROR',
    ])
  })
})
