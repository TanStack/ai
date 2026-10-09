import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import {
  StreamReconnectLimitError,
  fetchHttpStream,
  fetchJson,
} from '../src/connection-adapters'
import type { RunAgentInputContext } from '../src/connection-adapters'
import type { StreamChunk, UIMessage } from '@tanstack/ai/client'

const messages: Array<UIMessage> = [
  { id: 'msg-1', role: 'user', parts: [{ type: 'text', content: 'Hi' }] },
]

const runContext: RunAgentInputContext = {
  threadId: 'thread-1',
  runId: 'run-1',
  headers: { 'X-Byok': 'key-1' },
}

function contentChunk(delta: string) {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm',
    timestamp: 0,
    delta,
  }
}

/** A RUN_FINISHED as the server puts it on the wire (spec usage[] + metadata). */
function wireFinishedChunk() {
  return {
    type: EventType.RUN_FINISHED,
    threadId: 'thread-1',
    runId: 'run-1',
    timestamp: 0,
    usage: [{ inputTokens: 3, outputTokens: 5, totalTokens: 8 }],
    metadata: { tanstack: { finishReason: 'stop' } },
  }
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

type FetchStep = Response | Error

/** A fetch mock that answers each call with the next step (a reply or a network failure). */
function fetchSequence(...steps: Array<FetchStep>) {
  return vi.fn<typeof fetch>(async () => {
    const step = steps.shift()
    if (step === undefined) throw new Error('unexpected extra request')
    if (step instanceof Error) throw step
    return step
  })
}

function requestAt(
  fetchClient: ReturnType<typeof fetchSequence>,
  index: number,
) {
  const call = fetchClient.mock.calls[index]
  if (call === undefined) throw new Error(`no request #${index}`)
  const [input, init] = call
  return {
    url: String(input),
    method: init?.method,
    headers: new Headers(init?.headers),
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    credentials: init?.credentials,
  }
}

function requestedUrls(fetchClient: ReturnType<typeof fetchSequence>) {
  return fetchClient.mock.calls.map(([input]) => String(input))
}

async function collect(iterable: AsyncIterable<StreamChunk>) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks
}

function deltasOf(chunks: Array<StreamChunk>) {
  return chunks
    .filter((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)
    .map((c) => c.delta)
}

function connectWith(
  fetchClient: ReturnType<typeof fetchSequence>,
  signal?: AbortSignal,
  pollIntervalMs = 0,
) {
  const adapter = fetchJson('/api/chat', {
    fetchClient,
    pollIntervalMs,
    reconnect: { delayMs: 0 },
  })
  return adapter.connect(messages, undefined, signal, runContext)
}

describe('fetchJson', () => {
  it('POSTs the same body and headers as fetchHttpStream, plus Accept: application/json', async () => {
    const jsonFetch = fetchSequence(jsonResponse({ chunks: [], done: true }))
    const streamFetch = fetchSequence(new Response(''))
    const options = {
      headers: { Authorization: 'Bearer token' },
      credentials: 'include' as const,
      body: { model: 'gpt-5.5' },
    }

    await collect(
      fetchJson('/api/chat', { ...options, fetchClient: jsonFetch }).connect(
        messages,
        { extra: 1 },
        undefined,
        runContext,
      ),
    )
    await collect(
      fetchHttpStream('/api/chat', {
        ...options,
        fetchClient: streamFetch,
      }).connect(messages, { extra: 1 }, undefined, runContext),
    )

    const json = requestAt(jsonFetch, 0)
    const stream = requestAt(streamFetch, 0)
    expect(json.url).toBe('/api/chat')
    expect(json.method).toBe('POST')
    expect(json.credentials).toBe('include')
    expect(json.body).toEqual(stream.body)
    expect(json.body).toMatchObject({
      threadId: 'thread-1',
      runId: 'run-1',
      forwardedProps: { model: 'gpt-5.5', extra: 1 },
    })
    expect(json.headers.get('Accept')).toBe('application/json')
    expect(json.headers.get('Content-Type')).toBe('application/json')
    expect(json.headers.get('Authorization')).toBe('Bearer token')
    expect(json.headers.get('X-Byok')).toBe('key-1')
    expect(json.headers.get('X-Run-Id')).toBe('run-1')
    expect(stream.headers.get('X-Run-Id')).toBe('run-1')
  })

  it('restores usage and extras on each chunk, in order', async () => {
    const fetchClient = fetchSequence(
      jsonResponse({
        chunks: [contentChunk('Hello'), wireFinishedChunk()],
        done: true,
      }),
    )

    const chunks = await collect(connectWith(fetchClient))

    expect(chunks.map((c) => c.type)).toEqual([
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.RUN_FINISHED,
    ])
    expect(chunks[1]).toMatchObject({
      finishReason: 'stop',
      usage: { promptTokens: 3, completionTokens: 5, totalTokens: 8 },
    })
  })

  it('polls GET ?runId&offset until done: true, with no duplicate chunks', async () => {
    const fetchClient = fetchSequence(
      jsonResponse({ chunks: [contentChunk('a')], offset: '1', done: false }),
      jsonResponse({ chunks: [], offset: '1', done: false }),
      jsonResponse({ chunks: [contentChunk('b')], offset: '2', done: false }),
      jsonResponse({
        chunks: [contentChunk('c'), wireFinishedChunk()],
        offset: '4',
        done: true,
      }),
    )

    const chunks = await collect(connectWith(fetchClient))

    expect(deltasOf(chunks)).toEqual(['a', 'b', 'c'])
    expect(chunks).toHaveLength(4)
    expect(requestedUrls(fetchClient)).toEqual([
      '/api/chat',
      '/api/chat?runId=run-1&offset=1',
      '/api/chat?runId=run-1&offset=1',
      '/api/chat?runId=run-1&offset=2',
    ])
    expect(requestAt(fetchClient, 1).method).toBe('GET')
    expect(requestAt(fetchClient, 1).headers.get('Accept')).toBe(
      'application/json',
    )
  })

  it('throws the HTTP status on a non-2xx reply', async () => {
    const fetchClient = fetchSequence(
      new Response('upstream down', { status: 502, statusText: 'Bad Gateway' }),
    )

    await expect(collect(connectWith(fetchClient))).rejects.toThrow(
      'HTTP error! status: 502 Bad Gateway',
    )
  })

  it('throws a clear error, not a SyntaxError, when the body is not JSON', async () => {
    const fetchClient = fetchSequence(
      new Response('<html><body>Proxy error</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    )

    const error = await collect(connectWith(fetchClient)).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(SyntaxError)
    expect(error).toHaveProperty(
      'message',
      expect.stringContaining('not JSON (content-type: text/html)'),
    )
  })

  it('throws a clear error when the JSON body has the wrong shape', async () => {
    const fetchClient = fetchSequence(jsonResponse({ messages: [] }))

    await expect(collect(connectWith(fetchClient))).rejects.toThrow(
      '{ chunks, done, offset? }',
    )
  })

  it('throws when done: false has no offset to resume from', async () => {
    const fetchClient = fetchSequence(
      jsonResponse({ chunks: [contentChunk('a')], done: false }),
    )

    await expect(collect(connectWith(fetchClient))).rejects.toThrow(
      'done: false without an offset',
    )
  })

  it('retries a failed poll', async () => {
    const fetchClient = fetchSequence(
      jsonResponse({ chunks: [contentChunk('a')], offset: '1', done: false }),
      new TypeError('Failed to fetch'),
      jsonResponse({ chunks: [contentChunk('b')], offset: '2', done: true }),
    )

    const chunks = await collect(connectWith(fetchClient))

    expect(deltasOf(chunks)).toEqual(['a', 'b'])
    expect(requestedUrls(fetchClient)).toEqual([
      '/api/chat',
      '/api/chat?runId=run-1&offset=1',
      '/api/chat?runId=run-1&offset=1',
    ])
  })

  it('gives up on a poll after the reconnect ceiling', async () => {
    const fetchClient = fetchSequence(
      jsonResponse({ chunks: [], offset: '1', done: false }),
      new TypeError('Failed to fetch'),
      new TypeError('Failed to fetch'),
    )
    const adapter = fetchJson('/api/chat', {
      fetchClient,
      pollIntervalMs: 0,
      reconnect: { maxAttempts: 1, delayMs: 0 },
    })

    await expect(
      collect(adapter.connect(messages, undefined, undefined, runContext)),
    ).rejects.toBeInstanceOf(StreamReconnectLimitError)
    expect(fetchClient).toHaveBeenCalledTimes(3)
  })

  it('does not retry a failed first POST', async () => {
    const networkError = new TypeError('Failed to fetch')
    const fetchClient = fetchSequence(
      networkError,
      jsonResponse({ chunks: [], done: true }),
    )

    await expect(collect(connectWith(fetchClient))).rejects.toMatchObject({
      cause: networkError,
    })
    expect(fetchClient).toHaveBeenCalledTimes(1)
  })

  it('ends at once with no further request when stopped during the poll delay', async () => {
    const fetchClient = fetchSequence(
      jsonResponse({ chunks: [contentChunk('a')], offset: '1', done: false }),
      jsonResponse({ chunks: [contentChunk('b')], offset: '2', done: true }),
    )
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 20)

    const chunks = await collect(
      connectWith(fetchClient, controller.signal, 60_000),
    )

    expect(deltasOf(chunks)).toEqual(['a'])
    expect(fetchClient).toHaveBeenCalledTimes(1)
  })

  it('joinRun starts with GET ?runId&offset=-1', async () => {
    const fetchClient = fetchSequence(
      jsonResponse({ chunks: [contentChunk('a')], offset: '1', done: false }),
      jsonResponse({ chunks: [contentChunk('b')], offset: '2', done: true }),
    )
    const adapter = fetchJson('/api/chat', { fetchClient, pollIntervalMs: 0 })

    const chunks = await collect(adapter.joinRun('run-9'))

    expect(deltasOf(chunks)).toEqual(['a', 'b'])
    expect(requestAt(fetchClient, 0).method).toBe('GET')
    expect(requestedUrls(fetchClient)).toEqual([
      '/api/chat?runId=run-9&offset=-1',
      '/api/chat?runId=run-9&offset=1',
    ])
  })

  it('hydrate GETs ?threadId', async () => {
    const fetchClient = fetchSequence(
      jsonResponse({ messages: [], activeRun: { runId: 'run-3' } }),
    )
    const adapter = fetchJson('/api/chat', { fetchClient })
    if (adapter.hydrate === undefined) {
      throw new Error('expected hydration support')
    }

    const result = await adapter.hydrate('thread-1')

    expect(result.activeRun).toEqual({ runId: 'run-3' })
    expect(requestedUrls(fetchClient)).toEqual(['/api/chat?threadId=thread-1'])
  })
})
