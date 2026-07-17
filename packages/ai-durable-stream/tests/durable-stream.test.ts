import { describe, expect, it, vi } from 'vitest'
import { EventType, toServerSentEventsResponse } from '@tanstack/ai'
import { durableStream } from '../src'
import type { StreamChunk } from '@tanstack/ai'
import type { DurableStreamOffset } from '../src'

interface WireRecord {
  v: 1
  seq: number
  chunk: StreamChunk
}

interface CapturedRequest {
  url: URL
  method: string
  headers: Headers
  body?: string
  signal?: AbortSignal | null
}

interface StoredBatch {
  startOffset: string
  nextOffset: string
  records: Array<WireRecord>
}

interface ProtocolServerOptions {
  createOffset?: string
  appendOffsets?: Array<string | null>
  closeResponse?: () => Promise<Response>
  readStatus?: number
  loseAppendResponses?: number
}

function textChunk(delta: string) {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'message-1',
    delta,
    timestamp: 0,
  } as const
}

function textStream(deltas: Array<string>): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const delta of deltas) yield textChunk(delta)
    },
  }
}

function isStreamChunk(value: unknown): value is StreamChunk {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

function isWireRecord(value: unknown): value is WireRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    value.v === 1 &&
    'seq' in value &&
    typeof value.seq === 'number' &&
    'chunk' in value &&
    isStreamChunk(value.chunk)
  )
}

function parseRecords(body: string | undefined) {
  if (body === undefined) throw new Error('Expected an append body')
  const parsed: unknown = JSON.parse(body)
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON record array')
  const records: Array<WireRecord> = []
  for (const value of parsed) {
    if (!isWireRecord(value)) throw new Error('Invalid versioned wire record')
    records.push(value)
  }
  return records
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (input instanceof Request) return new URL(input.url)
  return new URL(input.toString())
}

function createHeaders(offset: string | null, closed = false) {
  const headers = new Headers()
  if (offset !== null) headers.set('Stream-Next-Offset', offset)
  if (closed) headers.set('Stream-Closed', 'true')
  return headers
}

function dataEvent(records: Array<WireRecord>) {
  return `event: data\ndata: ${JSON.stringify(records)}\n\n`
}

function controlEvent(control: {
  streamNextOffset: string
  streamCursor?: string
  upToDate?: boolean
  streamClosed?: boolean
}) {
  return `event: control\ndata: ${JSON.stringify(control)}\n\n`
}

function makeProtocolServer(options: ProtocolServerOptions = {}) {
  const requests: Array<CapturedRequest> = []
  const batches: Array<StoredBatch> = []
  const createOffset =
    options.createOffset ?? 'origin::partition/A?cursor=%2F+=='
  let tailOffset = createOffset
  let closed = false
  let appendIndex = 0
  let lostAppendResponses = options.loseAppendResponses ?? 0
  const producerResponses = new Map<string, string>()

  const fetchStub = vi.fn<typeof fetch>(async (input, init) => {
    const url = requestUrl(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers = new Headers(init?.headers)
    const body = init?.body === undefined ? undefined : String(init.body)
    requests.push({
      url,
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: init?.signal,
    })

    if (method === 'PUT') {
      return new Response(null, {
        status: 201,
        headers: createHeaders(createOffset),
      })
    }

    if (method === 'POST' && headers.get('Stream-Closed') === 'true') {
      if (options.closeResponse) {
        const response = await options.closeResponse()
        if (response.ok) closed = true
        return response
      }
      closed = true
      return new Response(null, {
        status: 204,
        headers: createHeaders(tailOffset, true),
      })
    }

    if (method === 'POST') {
      const records = parseRecords(body)
      const producerId = headers.get('Producer-Id')
      const producerEpoch = headers.get('Producer-Epoch')
      const producerSeq = headers.get('Producer-Seq')
      const producerHeaders = [producerId, producerEpoch, producerSeq]
      if (
        producerHeaders.some((value) => value !== null) &&
        producerHeaders.some((value) => value === null)
      ) {
        return new Response(null, { status: 400 })
      }
      const producerKey =
        producerId === null || producerEpoch === null || producerSeq === null
          ? undefined
          : `${producerId}:${producerEpoch}:${producerSeq}`
      const deduplicatedOffset =
        producerKey === undefined
          ? undefined
          : producerResponses.get(producerKey)
      if (deduplicatedOffset !== undefined) {
        return new Response(null, {
          status: 204,
          headers: createHeaders(deduplicatedOffset),
        })
      }
      const configuredOffset = options.appendOffsets?.[appendIndex]
      const nextOffset =
        configuredOffset === undefined
          ? `opaque::next/${appendIndex}?token=%2B==`
          : configuredOffset
      appendIndex += 1
      if (nextOffset !== null && nextOffset.length > 0) {
        batches.push({ startOffset: tailOffset, nextOffset, records })
        tailOffset = nextOffset
        if (producerKey !== undefined) {
          producerResponses.set(producerKey, nextOffset)
        }
      }
      if (lostAppendResponses > 0) {
        lostAppendResponses -= 1
        throw new TypeError('append response was lost')
      }
      return new Response(null, {
        status: 204,
        headers: createHeaders(nextOffset),
      })
    }

    if (options.readStatus !== undefined) {
      return new Response(null, { status: options.readStatus })
    }

    const requestedOffset = url.searchParams.get('offset') ?? '-1'
    let firstBatch = 0
    if (requestedOffset === 'now' || requestedOffset === tailOffset) {
      firstBatch = batches.length
    } else if (requestedOffset !== '-1') {
      firstBatch = batches.findIndex(
        (batch) => batch.startOffset === requestedOffset,
      )
      if (firstBatch === -1) return new Response(null, { status: 400 })
    }

    let sse = ''
    for (let index = firstBatch; index < batches.length; index += 1) {
      const batch = batches[index]
      if (!batch) continue
      const isFinal = index === batches.length - 1
      sse += dataEvent(batch.records)
      sse += controlEvent({
        streamNextOffset: batch.nextOffset,
        ...(!closed || !isFinal
          ? { streamCursor: `collapse::${index}?edge=%2F` }
          : {}),
        ...(isFinal ? { upToDate: true } : {}),
        ...(closed && isFinal ? { streamClosed: true } : {}),
      })
    }
    if (firstBatch === batches.length) {
      sse += controlEvent({
        streamNextOffset: tailOffset,
        ...(closed
          ? { streamClosed: true }
          : { streamCursor: 'collapse::tail', upToDate: true }),
      })
    }
    return new Response(sse, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  })

  return {
    fetchStub,
    requests,
    batches,
    createOffset,
    closeCount: () =>
      requests.filter(
        (request) =>
          request.method === 'POST' &&
          request.headers.get('Stream-Closed') === 'true',
      ).length,
  }
}

function requestWithMethod(requests: Array<CapturedRequest>, method: string) {
  const request = requests.find((candidate) => candidate.method === method)
  if (!request) throw new Error(`Expected a ${method} request`)
  return request
}

async function readBody(response: Response) {
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

function parseTransportEvents(body: string) {
  return body
    .split('\n\n')
    .filter((block) => block.length > 0)
    .map((block) => {
      const lines = block.split('\n')
      const id = lines.find((line) => line.startsWith('id: '))?.slice(4)
      const data = lines.find((line) => line.startsWith('data: '))?.slice(6)
      if (!data) throw new Error(`Missing transport data in ${block}`)
      const parsed: unknown = JSON.parse(data)
      return { id, data: parsed }
    })
}

function deltaFrom(value: unknown) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('delta' in value) ||
    typeof value.delta !== 'string'
  ) {
    throw new Error('Expected a text chunk')
  }
  return value.delta
}

function deferred<T>() {
  let resolve = (_value: T): void => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('durableStream official HTTP protocol', () => {
  it('appends one versioned batch and returns one adapter offset per record', async () => {
    const server = makeProtocolServer()
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-batch'),
      { server: 'https://ds.test', fetch: server.fetchStub },
    )

    const offsets = await durability.append([
      textChunk('a'),
      textChunk('b'),
      textChunk('c'),
    ])

    expect(offsets).toHaveLength(3)
    expect(new Set(offsets).size).toBe(3)
    expect(server.requests.map((request) => request.method)).toEqual([
      'PUT',
      'POST',
    ])
    expect(
      requestWithMethod(server.requests, 'PUT').headers.get('Content-Type'),
    ).toBe('application/json')
    const appendRequest = requestWithMethod(server.requests, 'POST')
    expect(appendRequest.headers.get('Content-Type')).toBe('application/json')
    expect(parseRecords(appendRequest.body)).toEqual([
      { v: 1, seq: 1, chunk: textChunk('a') },
      { v: 1, seq: 2, chunk: textChunk('b') },
      { v: 1, seq: 3, chunk: textChunk('c') },
    ])
  })

  it('retries an ambiguously committed append with one producer tuple', async () => {
    const server = makeProtocolServer({ loseAppendResponses: 1 })
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-idempotent-producer'),
      { server: 'https://ds.test', fetch: server.fetchStub },
    )
    const source: AsyncIterable<StreamChunk> = {
      async *[Symbol.asyncIterator]() {
        yield textChunk('persisted-before-failure')
        throw new Error('provider failed')
      },
    }

    await readBody(
      toServerSentEventsResponse(source, {
        durability: { adapter: durability },
      }),
    )

    const appendRequests = server.requests.filter(
      (request) =>
        request.method === 'POST' &&
        request.headers.get('Stream-Closed') !== 'true',
    )
    expect(
      appendRequests.map((request) => request.headers.get('Producer-Seq')),
    ).toEqual(['0', '0', '1'])
    expect(
      new Set(
        appendRequests.map((request) => request.headers.get('Producer-Id')),
      ).size,
    ).toBe(1)
    expect(server.batches).toHaveLength(2)

    const replayed: Array<StreamChunk> = []
    for await (const { chunk } of durability.read('-1')) replayed.push(chunk)
    expect(replayed.map((chunk) => chunk.type)).toEqual([
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.RUN_ERROR,
    ])
  })

  it('applies static auth headers to create, append, close, and read', async () => {
    const server = makeProtocolServer()
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-static-auth'),
      {
        server: 'https://ds.test',
        fetch: server.fetchStub,
        headers: {
          Authorization: 'Bearer static-token',
          'Content-Type': 'text/plain',
          'Stream-Closed': 'false',
        },
      },
    )

    await durability.append([textChunk('secured')])
    await durability.close()
    for await (const _entry of durability.read('-1')) {
      // drain
    }

    expect(server.requests).toHaveLength(4)
    expect(
      server.requests.map((request) => request.headers.get('Authorization')),
    ).toEqual(Array.from({ length: 4 }, () => 'Bearer static-token'))
    expect(server.requests[0]?.headers.get('Content-Type')).toBe(
      'application/json',
    )
    expect(server.requests[1]?.headers.get('Content-Type')).toBe(
      'application/json',
    )
    expect(server.requests[2]?.headers.get('Stream-Closed')).toBe('true')
  })

  it('resolves rotating async auth headers for every protocol request', async () => {
    const server = makeProtocolServer()
    let token = 0
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-rotating-auth'),
      {
        server: 'https://ds.test',
        fetch: server.fetchStub,
        headers: async () => ({ Authorization: `Bearer token-${++token}` }),
      },
    )

    await durability.append([textChunk('secured')])
    await durability.close()
    for await (const _entry of durability.read('-1')) {
      // drain
    }

    expect(
      server.requests.map((request) => request.headers.get('Authorization')),
    ).toEqual([
      'Bearer token-1',
      'Bearer token-2',
      'Bearer token-3',
      'Bearer token-4',
    ])
  })

  it.each([
    ['missing', null],
    ['empty', ''],
  ])('fails when an append returns a %s next offset', async (_name, offset) => {
    const server = makeProtocolServer({ appendOffsets: [offset] })
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-bad-offset'),
      { server: 'https://ds.test', fetch: server.fetchStub },
    )

    await expect(durability.append([textChunk('x')])).rejects.toThrow(
      /Stream-Next-Offset/,
    )
  })

  it('parses conforming id-less data and control events', async () => {
    const server = makeProtocolServer()
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-idless'),
      { server: 'https://ds.test', fetch: server.fetchStub },
    )
    await durability.append([textChunk('a'), textChunk('b')])
    await durability.close()

    const received: Array<{ offset: DurableStreamOffset; delta: string }> = []
    for await (const entry of durability.read('-1')) {
      received.push({
        offset: entry.offset,
        delta:
          entry.chunk.type === EventType.TEXT_MESSAGE_CONTENT
            ? entry.chunk.delta
            : entry.chunk.type,
      })
    }

    expect(received.map((entry) => entry.delta)).toEqual(['a', 'b'])
    expect(new Set(received.map((entry) => entry.offset)).size).toBe(2)
  })

  it('reconnects an open SSE window with control offset and cursor', async () => {
    const requests: Array<CapturedRequest> = []
    let readNumber = 0
    const fetchStub = vi.fn<typeof fetch>(async (input, init) => {
      const url = requestUrl(input)
      const headers = new Headers(init?.headers)
      requests.push({
        url,
        method: (init?.method ?? 'GET').toUpperCase(),
        headers,
        signal: init?.signal,
      })
      readNumber += 1
      const record = {
        v: 1,
        seq: readNumber,
        chunk: textChunk(String(readNumber)),
      } satisfies WireRecord
      const nextOffset = `opaque::window/${readNumber}?token=%2F`
      return new Response(
        dataEvent([record]) +
          controlEvent({
            streamNextOffset: nextOffset,
            ...(readNumber === 1
              ? { streamCursor: 'collapse::window-1', upToDate: true }
              : { streamClosed: true }),
          }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )
    })
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-rollover'),
      { server: 'https://ds.test', fetch: fetchStub },
    )

    const deltas: Array<string> = []
    for await (const { chunk } of durability.read('-1')) {
      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT)
        deltas.push(chunk.delta)
    }

    expect(deltas).toEqual(['1', '2'])
    expect(requests[1]?.url.searchParams.get('offset')).toBe(
      'opaque::window/1?token=%2F',
    )
    expect(requests[1]?.url.searchParams.get('cursor')).toBe(
      'collapse::window-1',
    )
  })

  it('reconnects after a body read failure from the last valid control', async () => {
    const requests: Array<CapturedRequest> = []
    let readNumber = 0
    const fetchStub = vi.fn<typeof fetch>(async (input, init) => {
      const url = requestUrl(input)
      requests.push({
        url,
        method: (init?.method ?? 'GET').toUpperCase(),
        headers: new Headers(init?.headers),
        signal: init?.signal,
      })
      readNumber += 1

      if (readNumber === 1) {
        let pullNumber = 0
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            pullNumber += 1
            if (pullNumber === 1) {
              controller.enqueue(
                new TextEncoder().encode(
                  dataEvent([
                    { v: 1, seq: 1, chunk: textChunk('before-failure') },
                  ]) +
                    controlEvent({
                      streamNextOffset: 'opaque::after/1?token=%2F',
                      streamCursor: 'collapse::after-1',
                      upToDate: true,
                    }),
                ),
              )
              return
            }
            controller.error(new TypeError('socket read failed'))
          },
        })
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }

      return new Response(
        dataEvent([{ v: 1, seq: 2, chunk: textChunk('after-reconnect') }]) +
          controlEvent({
            streamNextOffset: 'opaque::after/2?token=%2F',
            streamClosed: true,
          }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )
    })
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-body-reconnect'),
      { server: 'https://ds.test', fetch: fetchStub },
    )

    const deltas: Array<string> = []
    for await (const { chunk } of durability.read('-1')) {
      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
        deltas.push(chunk.delta)
      }
    }

    expect(deltas).toEqual(['before-failure', 'after-reconnect'])
    expect(requests).toHaveLength(2)
    expect(requests[1]?.url.searchParams.get('offset')).toBe(
      'opaque::after/1?token=%2F',
    )
    expect(requests[1]?.url.searchParams.get('cursor')).toBe(
      'collapse::after-1',
    )
  })

  it('reconnects from the same control after data is read before a body failure', async () => {
    const requests: Array<CapturedRequest> = []
    let readNumber = 0
    const fetchStub = vi.fn<typeof fetch>(async (input, init) => {
      const url = requestUrl(input)
      requests.push({
        url,
        method: (init?.method ?? 'GET').toUpperCase(),
        headers: new Headers(init?.headers),
        signal: init?.signal,
      })
      readNumber += 1

      if (readNumber === 1) {
        return new Response(
          dataEvent([{ v: 1, seq: 1, chunk: textChunk('before-drop') }]) +
            controlEvent({
              streamNextOffset: 'opaque::stable/window?token=%2F',
              streamCursor: 'collapse::stable-window',
            }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      }

      if (readNumber === 2) {
        let pullNumber = 0
        return new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pullNumber += 1
              if (pullNumber === 1) {
                controller.enqueue(
                  new TextEncoder().encode(
                    dataEvent([
                      { v: 1, seq: 2, chunk: textChunk('during-drop') },
                    ]),
                  ),
                )
                return
              }
              controller.error(new TypeError('socket read failed'))
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      }

      return new Response(
        dataEvent([
          { v: 1, seq: 2, chunk: textChunk('during-drop') },
          { v: 1, seq: 3, chunk: textChunk('after-reconnect') },
        ]) +
          controlEvent({
            streamNextOffset: 'opaque::tail/window?token=%3D',
            streamClosed: true,
          }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )
    })
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-data-body-reconnect'),
      { server: 'https://ds.test', fetch: fetchStub },
    )

    const deltas: Array<string> = []
    for await (const { chunk } of durability.read('-1')) {
      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
        deltas.push(chunk.delta)
      }
    }

    expect(deltas).toEqual(['before-drop', 'during-drop', 'after-reconnect'])
    expect(requests).toHaveLength(3)
    expect(requests[2]?.url.searchParams.get('offset')).toBe(
      requests[1]?.url.searchParams.get('offset'),
    )
    expect(requests[2]?.url.searchParams.get('cursor')).toBe(
      requests[1]?.url.searchParams.get('cursor'),
    )
    expect(requests[2]?.url.searchParams.get('offset')).toBe(
      'opaque::stable/window?token=%2F',
    )
    expect(requests[2]?.url.searchParams.get('cursor')).toBe(
      'collapse::stable-window',
    )
  })

  it('fails loudly when a control event omits streamNextOffset', async () => {
    const fetchStub = vi.fn<typeof fetch>(
      async () =>
        new Response(
          'event: control\ndata: {"upToDate":true,"streamCursor":"c"}\n\n',
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
    )
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-bad-control'),
      { server: 'https://ds.test', fetch: fetchStub },
    )

    await expect(async () => {
      for await (const _entry of durability.read('-1')) {
        // drain
      }
    }).rejects.toThrow(/streamNextOffset/)
  })

  it('requires a separate runId when resuming from an adapter offset', async () => {
    const server = makeProtocolServer()
    const producer = durableStream(
      new Request('https://app.test/api/chat?runId=run-resume'),
      { server: 'https://ds.test', fetch: server.fetchStub },
    )
    const [resumeOffset] = await producer.append([textChunk('x')])
    if (!resumeOffset) throw new Error('Expected a resume offset')

    expect(() =>
      durableStream(
        new Request('https://app.test/api/chat', {
          headers: { 'Last-Event-ID': resumeOffset },
        }),
        { server: 'https://ds.test', fetch: server.fetchStub },
      ),
    ).toThrow(/resume offset requires a runId/)

    expect(
      durableStream(
        new Request('https://app.test/api/chat?runId=run-resume', {
          headers: { 'Last-Event-ID': resumeOffset },
        }),
        { server: 'https://ds.test', fetch: server.fetchStub },
      ).resumeFrom(),
    ).toBe(resumeOffset)
  })

  it('rejects CR/LF injection in run ids, prefixes, cursors, and controls', async () => {
    expect(() =>
      durableStream(
        new Request(
          `https://app.test/api/chat?runId=${encodeURIComponent('bad\nrun')}`,
        ),
        { server: 'https://ds.test' },
      ),
    ).toThrow(/CR\/LF/)
    expect(() =>
      durableStream(new Request('https://app.test/api/chat'), {
        server: 'https://ds.test',
        streamPrefix: 'bad\rprefix',
      }),
    ).toThrow(/CR\/LF/)

    const forgedCursor = `tanstack-ai-ds:v1:${encodeURIComponent(
      JSON.stringify({
        v: 1,
        backendOffset: 'bad\noffset',
        seq: 1,
      }),
    )}`
    expect(() =>
      durableStream(
        new Request('https://app.test/api/chat', {
          headers: { 'Last-Event-ID': forgedCursor },
        }),
        { server: 'https://ds.test' },
      ),
    ).toThrow(/CR\/LF/)

    const fetchStub = vi.fn<typeof fetch>(
      async () =>
        new Response(
          controlEvent({
            streamNextOffset: 'bad\ncontrol-offset',
            streamClosed: true,
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
    )
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-control-injection'),
      { server: 'https://ds.test', fetch: fetchStub },
    )
    await expect(async () => {
      for await (const _entry of durability.read('-1')) {
        // drain
      }
    }).rejects.toThrow(/CR\/LF/)
  })

  it('omits server when a routing fetch (e.g. a service binding) is provided', async () => {
    const server = makeProtocolServer()
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-binding'),
      { fetch: server.fetchStub },
    )

    const [offset] = await durability.append([textChunk('x')])
    expect(offset).toBeTruthy()

    // The adapter routed through the provided fetch using an internal base URL,
    // so only the `/streams/...` path is meaningful.
    const firstCall = server.fetchStub.mock.calls[0]
    if (!firstCall) throw new Error('Expected the adapter to call fetch')
    expect(String(firstCall[0])).toContain('/streams/')
  })

  it('requires server when no fetch is provided', () => {
    expect(() =>
      durableStream(
        new Request('https://app.test/api/chat?runId=run-no-fetch'),
        {},
      ),
    ).toThrow(/server is required unless a fetch/)
  })

  it('awaits external close and sends the protocol close header', async () => {
    const closing = deferred<Response>()
    const server = makeProtocolServer({
      closeResponse: () => closing.promise,
    })
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-close'),
      { server: 'https://ds.test', fetch: server.fetchStub },
    )
    await durability.append([textChunk('x')])

    const closePromise = durability.close()
    let settled = false
    void closePromise.then(() => {
      settled = true
    })
    await vi.waitFor(() => expect(server.closeCount()).toBe(1))
    expect(settled).toBe(false)
    const closeRequest = server.requests.at(-1)
    expect(closeRequest?.headers.get('Stream-Closed')).toBe('true')

    closing.resolve(
      new Response(null, {
        status: 204,
        headers: createHeaders('opaque::closed', true),
      }),
    )
    await expect(closePromise).resolves.toBeUndefined()
  })

  it('surfaces close and read HTTP failures', async () => {
    const closeServer = makeProtocolServer({
      closeResponse: async () => new Response(null, { status: 503 }),
    })
    const closeDurability = durableStream(
      new Request('https://app.test/api/chat?runId=run-close-error'),
      { server: 'https://ds.test', fetch: closeServer.fetchStub },
    )
    await closeDurability.append([textChunk('x')])
    await expect(closeDurability.close()).rejects.toThrow(/failed to close/)

    const readServer = makeProtocolServer({ readStatus: 502 })
    const readDurability = durableStream(
      new Request('https://app.test/api/chat?runId=run-read-error'),
      { server: 'https://ds.test', fetch: readServer.fetchStub },
    )
    await expect(async () => {
      for await (const _entry of readDurability.read('-1')) {
        // drain
      }
    }).rejects.toThrow(/failed to read/)
  })

  it.each([
    ['next offset', createHeaders(null, true)],
    ['closed state', createHeaders('opaque::closed', false)],
  ])(
    'rejects a successful close response missing its %s',
    async (_name, headers) => {
      const server = makeProtocolServer({
        closeResponse: async () => new Response(null, { status: 204, headers }),
      })
      const durability = durableStream(
        new Request('https://app.test/api/chat?runId=run-invalid-close'),
        { server: 'https://ds.test', fetch: server.fetchStub },
      )
      await durability.append([textChunk('x')])

      await expect(durability.close()).rejects.toThrow(/close response/i)
    },
  )

  it('retries close after a transient failure', async () => {
    let closeAttempt = 0
    const server = makeProtocolServer({
      closeResponse: async () => {
        closeAttempt += 1
        return closeAttempt === 1
          ? new Response(null, { status: 503 })
          : new Response(null, {
              status: 204,
              headers: createHeaders('opaque::closed', true),
            })
      },
    })
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-close-retry'),
      { server: 'https://ds.test', fetch: server.fetchStub },
    )
    await durability.append([textChunk('x')])

    await expect(durability.close()).rejects.toThrow(/failed to close/i)
    await expect(durability.close()).resolves.toBeUndefined()
    expect(server.closeCount()).toBe(2)
  })

  it.each([
    [
      'closed control',
      controlEvent({ streamNextOffset: 'opaque::closed', streamClosed: true }),
    ],
    ['parse failure', 'event: unexpected\ndata: {}\n\n'],
  ])('cancels the replay body after %s', async (_name, body) => {
    const cancel = vi.fn<UnderlyingSourceCancelCallback>(() => undefined)
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body))
        },
        cancel,
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    )
    const fetchStub = vi.fn<typeof fetch>(async () => response)
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-cancel-body'),
      { server: 'https://ds.test', fetch: fetchStub },
    )

    const consume = async () => {
      for await (const _entry of durability.read('-1')) {
        // drain
      }
    }
    if (_name === 'parse failure') {
      await expect(consume()).rejects.toThrow(/unexpected SSE event type/)
    } else {
      await expect(consume()).resolves.toBeUndefined()
    }
    expect(cancel).toHaveBeenCalledOnce()
  })

  it(
    'cancels a pending replay body when aborted',
    { timeout: 500 },
    async () => {
      const cancel = vi.fn<UnderlyingSourceCancelCallback>(() => undefined)
      const response = new Response(
        new ReadableStream<Uint8Array>({ cancel }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
      const fetchStub = vi.fn<typeof fetch>(async () => response)
      const durability = durableStream(
        new Request('https://app.test/api/chat?runId=run-abort-body'),
        { server: 'https://ds.test', fetch: fetchStub },
      )
      const controller = new AbortController()
      const iterator = durability
        .read('-1', controller.signal)
        [Symbol.asyncIterator]()
      const next = iterator.next()

      await vi.waitFor(() => expect(fetchStub).toHaveBeenCalledOnce())
      controller.abort()

      await expect(next).resolves.toEqual({ done: true, value: undefined })
      expect(cancel).toHaveBeenCalledOnce()
    },
  )

  it('propagates read abort and ends the iterator cleanly', async () => {
    const fetchStub = vi.fn<typeof fetch>(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          if (!signal) throw new Error('Expected a read abort signal')
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-abort'),
      { server: 'https://ds.test', fetch: fetchStub },
    )
    const controller = new AbortController()
    const iterator = durability
      .read('-1', controller.signal)
      [Symbol.asyncIterator]()
    const next = iterator.next()

    await vi.waitFor(() => expect(fetchStub).toHaveBeenCalledOnce())
    controller.abort()
    await expect(next).resolves.toEqual({ done: true, value: undefined })
  })
})

describe('durableStream exact-once resume', () => {
  it('resumes mid-way through a coalesced data batch without gaps or duplicates', async () => {
    const server = makeProtocolServer({
      createOffset: 'opaque::batch-start/A?token=%2F+==',
      appendOffsets: ['opaque::batch-end/Z?token=%3D'],
    })
    const full = ['a', 'b', 'c', 'd', 'e', 'f']
    const producer = durableStream(
      new Request('https://app.test/api/chat?runId=run-exact-once'),
      { server: 'https://ds.test', fetch: server.fetchStub },
    )
    const produced = parseTransportEvents(
      await readBody(
        toServerSentEventsResponse(textStream(full), {
          durability: { adapter: producer },
        }),
      ),
    )

    expect(server.batches).toHaveLength(1)
    expect(produced.every((event) => event.id !== undefined)).toBe(true)
    const beforeDrop = produced.slice(0, 2)
    const resumeOffset = beforeDrop.at(-1)?.id
    if (!resumeOffset) throw new Error('Expected a resume offset')
    expect(decodeURIComponent(resumeOffset)).not.toContain('runId')
    const exploding: AsyncIterable<StreamChunk> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            throw new Error('input stream must not be iterated on resume')
          },
        }
      },
    }
    const reconnect = durableStream(
      new Request('https://app.test/api/chat?runId=run-exact-once', {
        headers: { 'Last-Event-ID': resumeOffset },
      }),
      { server: 'https://ds.test', fetch: server.fetchStub },
    )
    const afterDrop = parseTransportEvents(
      await readBody(
        toServerSentEventsResponse(exploding, {
          durability: { adapter: reconnect },
        }),
      ),
    )

    expect(
      [...beforeDrop, ...afterDrop].map((event) => deltaFrom(event.data)),
    ).toEqual(full)
    const replayRequest = server.requests.find(
      (request) => request.method === 'GET',
    )
    expect(replayRequest?.url.searchParams.get('offset')).toBe(
      server.createOffset,
    )
    expect(server.closeCount()).toBe(1)
  })
})
