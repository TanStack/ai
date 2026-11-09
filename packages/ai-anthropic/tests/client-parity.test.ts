import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { toFile } from '@anthropic-ai/sdk/core/uploads'
import { createAnthropicClient } from '../src/client'
import type { ClientOptions } from '@anthropic-ai/sdk'
import type { AnthropicClient } from '../src/client'

// The real SDK is the oracle: each test runs it and our client on the same
// fetch and compares what went out and what came back.

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_BASE_URL', '')
  vi.stubEnv('ANTHROPIC_API_KEY', '')
  vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '')
  vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', '')
  vi.stubEnv('ANTHROPIC_LOG', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

interface SentRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

/** The headers to compare: no SDK telemetry, no multipart boundary. */
function comparableHeaders(headers: Headers) {
  const result: Record<string, string> = {}
  for (const [name, value] of headers) {
    if (name.startsWith('x-stainless-') || name === 'user-agent') continue
    result[name] = value.startsWith('multipart/form-data')
      ? 'multipart/form-data'
      : value
  }
  return result
}

async function readRequestBody(request: Request) {
  const type = request.headers.get('content-type') ?? ''
  if (type.startsWith('application/json')) return request.json()
  if (!type.startsWith('multipart/form-data')) return undefined
  const fields: Array<unknown> = []
  for (const [name, value] of await request.formData()) {
    fields.push(
      typeof value === 'string'
        ? [name, value]
        : [name, value.name, value.type, await value.text()],
    )
  }
  return fields
}

type Responder = (request: Request) => Response

/** A fetch that records every request and answers with `respond`. */
function recordingFetch(respond: Responder) {
  const requests: Array<SentRequest> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    // The SDK probes a custom fetch for FormData support once.
    if (request.url.startsWith('data:')) return new Response('')
    requests.push({
      url: request.url,
      method: request.method,
      headers: comparableHeaders(request.headers),
      body: await readRequestBody(request.clone()),
    })
    return respond(request)
  }
  return { fetch, requests }
}

/** The fields of a thrown error that callers read. */
function describeError(error: unknown) {
  if (!(error instanceof Error)) return { thrown: error }
  return {
    class: error.constructor.name,
    message: error.message,
    ...('status' in error && { status: error.status }),
    ...('error' in error && { error: error.error }),
    ...('type' in error && { type: error.type }),
    ...('requestID' in error && { requestID: error.requestID }),
  }
}

/**
 * Runs `call` on the real SDK and on our client with the same options and a
 * fetch that answers with `respond`. Gives back `[sdk, ours]`.
 */
async function onBoth(
  options: ClientOptions,
  respond: Responder,
  call: (client: AnthropicClient) => Promise<unknown>,
) {
  const makers = [
    // The SDK declares its own request types; the runtime calls are the same.
    (clientOptions: ClientOptions) =>
      new Anthropic(clientOptions) as AnthropicClient,
    createAnthropicClient,
  ]
  return Promise.all(
    makers.map(async (make) => {
      const { fetch, requests } = recordingFetch(respond)
      const result = await call(make({ ...options, fetch })).then(
        (value) => ({ value }),
        (error: unknown) => ({ error: describeError(error) }),
      )
      return { requests, result }
    }),
  )
}

/** Reads every stream event that `create` gives back. */
async function collect(result: Awaited<ReturnType<typeof create>>) {
  if (!(Symbol.asyncIterator in result)) return result
  const events: Array<unknown> = []
  for await (const event of result) events.push(event)
  return events
}

const create = (
  client: AnthropicClient,
  params: Partial<Parameters<AnthropicClient['beta']['messages']['create']>[0]>,
  options?: Parameters<AnthropicClient['beta']['messages']['create']>[1],
) =>
  client.beta.messages.create(
    {
      model: 'claude-haiku-4-5',
      max_tokens: 64,
      messages: [{ role: 'user', content: 'Hi' }],
      ...params,
    },
    options,
  )

const message = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-4-5',
  content: [{ type: 'text', text: 'Hello' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 2, output_tokens: 1 },
}

const fileMetadata = {
  id: 'file_1',
  type: 'file',
  filename: 'notes.txt',
  mime_type: 'text/plain',
  size_bytes: 5,
  created_at: '2026-10-03T00:00:00Z',
  downloadable: false,
}

const sse = (events: Array<[string, unknown]>) =>
  new Response(
    events
      .map(
        ([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
      )
      .join(''),
    {
      headers: { 'content-type': 'text/event-stream', 'request-id': 'req_s' },
    },
  )

const errorResponse = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'application/json', 'request-id': 'req_e' },
  })

const replyJSON = (body: unknown) => () => Response.json(body)

describe('client parity with the Anthropic SDK', () => {
  it('sends the same non-stream request and reads the same message', async () => {
    const [sdk, ours] = await onBoth(
      {
        apiKey: 'test-key',
        defaultQuery: { team: 'a' },
        defaultHeaders: { 'x-trace': 't1' },
      },
      replyJSON(message),
      (client) =>
        create(client, {
          betas: ['files-api-2025-04-14', 'context-1m-2025-08-07'],
          workspace_id: 'wrk_1',
        }),
    )
    expect(ours).toEqual(sdk)
    expect(ours!.requests[0]).toMatchObject({
      url: 'https://api.anthropic.com/v1/messages?beta=true&team=a',
      method: 'POST',
      headers: {
        'anthropic-beta': 'files-api-2025-04-14,context-1m-2025-08-07',
        'anthropic-version': '2023-06-01',
        'anthropic-workspace-id': 'wrk_1',
        'x-api-key': 'test-key',
        'x-trace': 't1',
      },
    })
    expect(ours!.result).toEqual({ value: message })
  })

  it('streams the same events, without ping and unknown events', async () => {
    const start = {
      type: 'message_start',
      message: { ...message, content: [] },
    }
    const delta = {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Hello' },
    }
    const stop = { type: 'message_stop' }
    const [sdk, ours] = await onBoth(
      { apiKey: 'test-key' },
      () =>
        sse([
          ['message_start', start],
          ['ping', { type: 'ping' }],
          ['content_block_delta', delta],
          ['future_event', { type: 'future_event' }],
          ['message_stop', stop],
        ]),
      async (client) => collect(await create(client, { stream: true })),
    )
    expect(ours).toEqual(sdk)
    expect(ours!.result).toEqual({ value: [start, delta, stop] })
  })

  it('throws the same APIError for an SSE error event', async () => {
    const body = {
      type: 'error',
      error: { type: 'overloaded_error', message: 'Overloaded' },
    }
    const [sdk, ours] = await onBoth(
      { apiKey: 'test-key' },
      () => sse([['error', body]]),
      async (client) => collect(await create(client, { stream: true })),
    )
    expect(ours).toEqual(sdk)
    expect(ours!.result).toEqual({
      error: {
        class: 'APIError',
        // `APIError.makeMessage` reads `message` at the top of the body only.
        message: JSON.stringify(body),
        status: undefined,
        error: body,
        type: 'overloaded_error',
        requestID: 'req_s',
      },
    })
  })

  it.each([
    [
      400,
      JSON.stringify({
        type: 'error',
        error: { type: 'invalid_request_error', message: 'Bad' },
      }),
    ],
    [
      529,
      JSON.stringify({
        type: 'error',
        error: { type: 'overloaded_error', message: 'Overloaded' },
      }),
    ],
    [502, 'upstream down'],
  ])('throws the same error class for a %i response', async (status, body) => {
    const [sdk, ours] = await onBoth(
      { apiKey: 'test-key', maxRetries: 0 },
      () => errorResponse(status, body),
      (client) => create(client, {}),
    )
    expect(ours).toEqual(sdk)
  })

  it('throws the same connection error when fetch fails', async () => {
    const [sdk, ours] = await onBoth(
      { apiKey: 'test-key', maxRetries: 0 },
      () => {
        throw new TypeError('fetch failed')
      },
      (client) => create(client, {}),
    )
    expect(ours!.result).toEqual(sdk!.result)
    expect(ours!.result).toMatchObject({
      error: { class: 'APIConnectionError', message: 'Connection error.' },
    })
  })

  it('refuses the same long non-stream request, but not on a withOptions copy', async () => {
    const [sdk, ours] = await onBoth(
      { apiKey: 'test-key' },
      replyJSON(message),
      async (client) => {
        // The SDK throws this one before it gives back a promise.
        const refused = await Promise.resolve()
          .then(() => create(client, { max_tokens: 64000 }))
          .then(
            () => 'sent',
            (error: unknown) => describeError(error),
          )
        const copy = await create(client.withOptions({}), {
          max_tokens: 64000,
        })
        return { refused, copy }
      },
    )
    expect(ours).toEqual(sdk)
    expect(ours!.result).toMatchObject({
      value: {
        refused: {
          class: 'AnthropicError',
          message: expect.stringContaining('Streaming is required'),
        },
      },
    })
    expect(ours!.requests).toHaveLength(1)
  })

  it('uploads the same multipart form', async () => {
    const file = await toFile(new Blob(['hello']), 'notes.txt', {
      type: 'text/plain',
    })
    const [sdk, ours] = await onBoth(
      { apiKey: 'test-key' },
      replyJSON(fileMetadata),
      (client) =>
        client.beta.files.upload({ file, betas: ['files-api-2025-04-14'] }),
    )
    expect(ours).toEqual(sdk)
    expect(ours!.requests[0]).toMatchObject({
      url: 'https://api.anthropic.com/v1/files?beta=true',
      body: [['file', 'notes.txt', 'text/plain', 'hello']],
    })
  })

  it('reads and deletes a file the same way, with null headers removed', async () => {
    const [sdk, ours] = await onBoth(
      {
        apiKey: null,
        authToken: 'token',
        defaultHeaders: { 'x-api-key': null, 'x-drop': 'a' },
      },
      replyJSON(fileMetadata),
      async (client) => {
        const betas = { betas: ['files-api-2025-04-14'] }
        const headers = { headers: { 'x-drop': null } }
        return [
          await client.beta.files.retrieveMetadata('file 1', betas, headers),
          await client.beta.files.delete('file 1', betas, headers),
        ]
      },
    )
    expect(ours).toEqual(sdk)
    expect(ours!.requests.map(({ method, url }) => [method, url])).toEqual([
      ['GET', 'https://api.anthropic.com/v1/files/file%201?beta=true'],
      ['DELETE', 'https://api.anthropic.com/v1/files/file%201?beta=true'],
    ])
    expect(ours!.requests[0]!.headers).toMatchObject({
      authorization: 'Bearer token',
    })
    expect(ours!.requests[0]!.headers).not.toHaveProperty('x-api-key')
    expect(ours!.requests[0]!.headers).not.toHaveProperty('x-drop')
  })

  it('reads ANTHROPIC_BASE_URL and ANTHROPIC_CUSTOM_HEADERS the same way', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://proxy.example/anthropic/')
    vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', 'x-team: blue\nx-env: test')
    const [sdk, ours] = await onBoth(
      { apiKey: 'test-key' },
      replyJSON(message),
      (client) => create(client, {}),
    )
    expect(ours).toEqual(sdk)
    expect(ours!.requests[0]).toMatchObject({
      url: 'https://proxy.example/anthropic/v1/messages?beta=true',
      headers: { 'x-team': 'blue', 'x-env': 'test' },
    })
  })

  it('refuses the same empty credential before any request', async () => {
    const [sdk, ours] = await onBoth(
      { apiKey: '', authToken: null },
      replyJSON(message),
      (client) => create(client, {}),
    )
    expect(ours).toEqual(sdk)
    expect(ours!.requests).toHaveLength(0)
  })
})

describe('createAnthropicClient', () => {
  it('runs SDK middleware through the real SDK', async () => {
    const seen: Array<string> = []
    const { fetch } = recordingFetch(replyJSON(message))
    const client = createAnthropicClient({
      apiKey: 'test-key',
      fetch,
      middleware: [
        async (request, next) => {
          seen.push(request.url)
          return next(request)
        },
      ],
    })
    expect(await create(client, {})).toEqual(message)
    expect(seen).toEqual(['https://api.anthropic.com/v1/messages?beta=true'])
  })

  it('throws the SDK browser error in a browser', () => {
    vi.stubGlobal('window', { document: {} })
    vi.stubGlobal('navigator', {})
    try {
      expect(() => createAnthropicClient({ apiKey: 'test-key' })).toThrow(
        "It looks like you're running in a browser-like environment.",
      )
      expect(() =>
        createAnthropicClient({
          apiKey: 'test-key',
          dangerouslyAllowBrowser: true,
        }),
      ).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
