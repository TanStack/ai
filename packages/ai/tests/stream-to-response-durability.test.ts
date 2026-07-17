import { describe, expect, it, vi } from 'vitest'
import { memoryStream } from '../src/stream-durability'
import {
  toHttpResponse,
  toServerSentEventsResponse,
} from '../src/stream-to-response'
import { EventType } from '../src/types'
import { ev } from './test-utils'
import type { StreamDurability } from '../src/stream-durability'
import type { StreamChunk } from '../src/types'

function fiveChunkStream(): {
  stream: AsyncIterable<StreamChunk>
  iterated: () => boolean
} {
  let started = false
  const stream: AsyncIterable<StreamChunk> = {
    async *[Symbol.asyncIterator]() {
      started = true
      for (const delta of ['1', '2', '3', '4', '5']) {
        yield ev.textContent(delta)
      }
    },
  }
  return { stream, iterated: () => started }
}

async function readBody(response: Response): Promise<string> {
  if (!response.body) throw new Error('Expected a response body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  for (;;) {
    const result = await reader.read()
    if (result.done) return body
    body += decoder.decode(result.value)
  }
}

interface ParsedSseEvent {
  id?: string
  data: unknown
}

function parseSseEvents(body: string): Array<ParsedSseEvent> {
  return body
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split('\n')
      const id = lines.find((line) => line.startsWith('id: '))?.slice(4)
      const data = lines.find((line) => line.startsWith('data: '))?.slice(6)
      if (!data) throw new Error(`Missing SSE data line in ${block}`)
      return { ...(id === undefined ? {} : { id }), data: JSON.parse(data) }
    })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function field(event: ParsedSseEvent, name: string): unknown {
  if (!isRecord(event.data)) throw new Error('Expected an object SSE payload')
  return event.data[name]
}

function label(chunk: StreamChunk): string {
  return chunk.type === EventType.TEXT_MESSAGE_CONTENT
    ? chunk.delta
    : `[${chunk.type}]`
}

function fixedOffsetDurability(
  offsets: Array<string>,
): StreamDurability<string> {
  return {
    resumeFrom: () => null,
    append: async () => offsets,
    close: async () => undefined,
    async *read() {
      // No replay is needed by these validation tests.
    },
  }
}

describe('toServerSentEventsResponse with durability', () => {
  it('appends a fresh run and tags every event with its adapter offset', async () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat?runId=response-fresh', {
        method: 'POST',
      }),
    )
    const { stream, iterated } = fiveChunkStream()

    const events = parseSseEvents(
      await readBody(
        toServerSentEventsResponse(stream, {
          durability: { adapter: durability },
        }),
      ),
    )
    const eventOffsets = events.map((event) => event.id)

    expect(iterated()).toBe(true)
    expect(events).toHaveLength(5)
    expect(eventOffsets.every((offset) => offset !== undefined)).toBe(true)
    expect(new Set(eventOffsets).size).toBe(5)

    const loggedOffsets: Array<string> = []
    const loggedLabels: Array<string> = []
    for await (const entry of durability.read('-1')) {
      loggedOffsets.push(entry.offset)
      loggedLabels.push(label(entry.chunk))
    }
    expect(loggedOffsets).toEqual(eventOffsets)
    expect(loggedLabels).toEqual(['1', '2', '3', '4', '5'])
  })

  it('logs a durability close failure server-side when debug is enabled', async () => {
    const closeError = new Error('close boom')
    let seq = 0
    const durability: StreamDurability<string> = {
      resumeFrom: () => null,
      append: async (chunks) => chunks.map(() => `off-${seq++}`),
      close: async () => {
        throw closeError
      },
      async *read() {
        // Not exercised by this test.
      },
    }
    const errorLog = vi.fn()
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: errorLog,
    }
    const { stream } = fiveChunkStream()

    // The rethrown close failure lands in-band as an error event; the consumer
    // drains cleanly. The point is that the cause is recorded server-side, where
    // a joiner (who only sees a generic incomplete error) cannot observe it.
    await readBody(
      toServerSentEventsResponse(stream, {
        durability: { adapter: durability },
        debug: { logger },
      }),
    )

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('closing durability stream failed'),
      expect.objectContaining({ error: closeError }),
    )
  })

  it('replays opaque IDs from the log without iterating the input stream', async () => {
    const { stream } = fiveChunkStream()
    const produced = parseSseEvents(
      await readBody(
        toServerSentEventsResponse(stream, {
          durability: {
            adapter: memoryStream(
              new Request(
                'https://example.test/api/chat?runId=response-replay',
                {
                  method: 'POST',
                },
              ),
            ),
          },
        }),
      ),
    )
    const resumeOffset = produced[1]?.id
    if (!resumeOffset) throw new Error('Expected a replay offset')
    const exploding: AsyncIterable<StreamChunk> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            throw new Error('input stream must not be iterated on resume')
          },
        }
      },
    }

    const replayed = parseSseEvents(
      await readBody(
        toServerSentEventsResponse(exploding, {
          durability: {
            adapter: memoryStream(
              new Request('https://example.test/api/chat', {
                method: 'POST',
                headers: { 'Last-Event-ID': resumeOffset },
              }),
            ),
          },
        }),
      ),
    )

    expect(replayed.map((event) => event.id)).toEqual(
      produced.slice(2).map((event) => event.id),
    )
    expect(replayed.map((event) => field(event, 'delta'))).toEqual([
      '3',
      '4',
      '5',
    ])
  })

  it('batches appends to at most the configured batch size', async () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat?runId=response-batch', {
        method: 'POST',
      }),
    )
    const appendSpy = vi.spyOn(durability, 'append')
    const { stream } = fiveChunkStream()

    await readBody(
      toServerSentEventsResponse(stream, {
        durability: { adapter: durability, batch: 2 },
      }),
    )

    const batchSizes = appendSpy.mock.calls.map(([chunks]) => chunks.length)
    expect(batchSizes.every((size) => size <= 2)).toBe(true)
    expect(batchSizes.reduce((sum, size) => sum + size, 0)).toBe(5)
  })

  it('rejects a non-positive-integer batch size', () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat?runId=response-bad-batch', {
        method: 'POST',
      }),
    )
    const { stream } = fiveChunkStream()
    for (const batch of [0, -1, 1.5, NaN]) {
      expect(() =>
        toServerSentEventsResponse(stream, {
          durability: { adapter: durability, batch },
        }),
      ).toThrow(/Invalid durability batch size/)
    }
  })

  it('rejects duplicate offsets before emitting distinct chunks', async () => {
    const { stream } = fiveChunkStream()
    const response = toServerSentEventsResponse(stream, {
      durability: {
        adapter: fixedOffsetDurability(Array.from({ length: 5 }, () => 'same')),
      },
    })

    const events = parseSseEvents(await readBody(response))
    expect(events).toHaveLength(1)
    expect(events[0]?.id).toBeUndefined()
    expect(field(events[0]!, 'type')).toBe(EventType.RUN_ERROR)
    expect(field(events[0]!, 'message')).toMatch(/unique.*offset/i)
  })

  it('rejects SSE offsets containing U+0000', async () => {
    const response = toServerSentEventsResponse(textStreamWithOneChunk(), {
      durability: { adapter: fixedOffsetDurability(['bad\0offset']) },
    })

    const events = parseSseEvents(await readBody(response))
    expect(events).toHaveLength(1)
    expect(events[0]?.id).toBeUndefined()
    expect(field(events[0]!, 'type')).toBe(EventType.RUN_ERROR)
    expect(field(events[0]!, 'message')).toMatch(/Invalid durability offset/)
  })

  it('persists a terminal RUN_ERROR before closing when the source throws', async () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat?runId=response-error', {
        method: 'POST',
      }),
    )
    const throwing: AsyncIterable<StreamChunk> = {
      async *[Symbol.asyncIterator]() {
        yield ev.textContent('1')
        throw new Error('provider exploded')
      },
    }

    const liveEvents = parseSseEvents(
      await readBody(
        toServerSentEventsResponse(throwing, {
          durability: { adapter: durability },
        }),
      ),
    )
    expect(liveEvents.map((event) => field(event, 'type'))).toContain(
      'RUN_ERROR',
    )

    const logged: Array<StreamChunk> = []
    for await (const { chunk } of durability.read('-1')) logged.push(chunk)
    expect(logged.map((chunk) => chunk.type)).toEqual([
      'TEXT_MESSAGE_CONTENT',
      'RUN_ERROR',
    ])
    expect(logged.at(-1)).toMatchObject({
      message: 'provider exploded',
    })
  })
})

/**
 * Parse an NDJSON body into the same `{ id?, data }` shape as `parseSseEvents`.
 * A durable line is an `{ id, chunk }` envelope; a non-durable line is a bare
 * chunk — both are auto-detected, mirroring the client parser.
 */
function parseNdjsonEvents(body: string): Array<ParsedSseEvent> {
  return body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parsed = JSON.parse(line) as Record<string, unknown>
      // Mirror the production `isNdjsonEnvelope` discriminator exactly: an
      // envelope carries `id` + `chunk` and no top-level `type`.
      if (
        'chunk' in parsed &&
        'id' in parsed &&
        typeof parsed.id === 'string' &&
        !('type' in parsed)
      ) {
        return { id: parsed.id, data: parsed.chunk }
      }
      return { data: parsed }
    })
}

describe('toHttpResponse with durability', () => {
  it('appends a fresh run and envelopes every line with its adapter offset', async () => {
    const durability = memoryStream(
      new Request('https://example.test/api/chat?runId=ndjson-fresh', {
        method: 'POST',
      }),
    )
    const { stream, iterated } = fiveChunkStream()

    const events = parseNdjsonEvents(
      await readBody(
        toHttpResponse(stream, { durability: { adapter: durability } }),
      ),
    )
    const eventOffsets = events.map((event) => event.id)

    expect(iterated()).toBe(true)
    expect(events).toHaveLength(5)
    expect(eventOffsets.every((offset) => offset !== undefined)).toBe(true)
    expect(new Set(eventOffsets).size).toBe(5)
    expect(events.map((event) => field(event, 'delta'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ])

    const loggedOffsets: Array<string> = []
    for await (const entry of durability.read('-1')) {
      loggedOffsets.push(entry.offset)
    }
    expect(loggedOffsets).toEqual(eventOffsets)
  })

  it('replays opaque IDs from the log without iterating the input stream', async () => {
    const { stream } = fiveChunkStream()
    const produced = parseNdjsonEvents(
      await readBody(
        toHttpResponse(stream, {
          durability: {
            adapter: memoryStream(
              new Request('https://example.test/api/chat?runId=ndjson-replay', {
                method: 'POST',
              }),
            ),
          },
        }),
      ),
    )
    const resumeOffset = produced[1]?.id
    if (!resumeOffset) throw new Error('Expected a replay offset')
    const exploding: AsyncIterable<StreamChunk> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            throw new Error('input stream must not be iterated on resume')
          },
        }
      },
    }

    const replayed = parseNdjsonEvents(
      await readBody(
        toHttpResponse(exploding, {
          durability: {
            adapter: memoryStream(
              new Request('https://example.test/api/chat', {
                method: 'POST',
                headers: { 'Last-Event-ID': resumeOffset },
              }),
            ),
          },
        }),
      ),
    )

    expect(replayed.map((event) => event.id)).toEqual(
      produced.slice(2).map((event) => event.id),
    )
    expect(replayed.map((event) => field(event, 'delta'))).toEqual([
      '3',
      '4',
      '5',
    ])
  })

  it('emits bare chunk lines (no envelope) when no durability is configured', async () => {
    const { stream } = fiveChunkStream()
    const events = parseNdjsonEvents(await readBody(toHttpResponse(stream)))

    expect(events).toHaveLength(5)
    expect(events.every((event) => event.id === undefined)).toBe(true)
    expect(events.map((event) => field(event, 'delta'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ])
  })
})

function textStreamWithOneChunk(): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      yield ev.textContent('one')
    },
  }
}
