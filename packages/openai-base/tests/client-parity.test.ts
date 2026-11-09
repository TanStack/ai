import OpenAI, { AzureOpenAI } from 'openai'
import {
  APIError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from 'openai/core/error'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAzureOpenAIClient, createOpenAIClient } from '../src/client'
import type { ClientOptions } from 'openai'
import type { AzureClientOptions } from 'openai/azure'
import type { OpenAIClientLike } from '../src/client'

/**
 * The SDK client as an `OpenAIClientLike`. Its method types take the SDK
 * request params, ours take the generated bodies, but the runtime calls are
 * identical, which is what these tests compare.
 */
const sdkClient = (client: OpenAI) => client as unknown as OpenAIClientLike

type Fetch = NonNullable<ClientOptions['fetch']>
type Reply = () => Response

interface Call {
  method: string
  url: string
  headers: Record<string, string>
  redirect: RequestRedirect | undefined
  body: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  isRecord(value) && Symbol.asyncIterator in value

const json =
  (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  () =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req_1',
        ...headers,
      },
    })

const sse =
  (...events: Array<string>) =>
  () =>
    new Response(events.map((event) => `${event}\n\n`).join(''), {
      headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req_s' },
    })

const bytes = (contentType: string) => () =>
  new Response(new Uint8Array([104, 105]), {
    headers: { 'content-type': contentType },
  })

/** JSON bodies parse; multipart bodies become sorted `[key, value]` pairs. */
async function readBody(body: BodyInit | null | undefined) {
  if (body instanceof FormData) {
    const fields: Array<[string, unknown]> = []
    for (const [key, value] of body) {
      fields.push([
        key,
        typeof value === 'string'
          ? value
          : { name: value.name, type: value.type, text: await value.text() },
      ])
    }
    // The SDK appends array fields after the others; the order has no meaning.
    return fields.sort(([a], [b]) => a.localeCompare(b))
  }
  return typeof body === 'string' ? JSON.parse(body) : body
}

/** A fetch that records each request and answers with the next reply. */
function recorder(...replies: Array<Reply>) {
  const calls: Array<Call> = []
  const fetch: Fetch = async (input, init = {}) => {
    const url = String(input)
    // The SDK probes FormData support with a `data:` URL before an upload.
    if (url.startsWith('data:')) return new Response('')
    const headers: Record<string, string> = {}
    for (const [name, value] of new Headers(init.headers)) {
      if (!name.startsWith('x-stainless-') && name !== 'user-agent') {
        headers[name] = value
      }
    }
    calls.push({
      method: String(init.method).toUpperCase(),
      url,
      headers,
      redirect: init.redirect,
      body: await readBody(init.body),
    })
    const reply = replies[Math.min(calls.length, replies.length) - 1]
    if (!reply) throw new Error('no reply')
    return reply()
  }
  return { fetch, calls }
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) return { thrown: error }
  return {
    name: error.constructor.name,
    message: error.message,
    ...(error instanceof APIError && {
      status: error.status,
      error: error.error,
      code: error.code,
      param: error.param,
      type: error.type,
      requestID: error.requestID,
      headers: error.headers && Object.fromEntries(error.headers),
    }),
  }
}

/** The observable result: body + request id, stream events, or raw bytes. */
async function unwrap(value: unknown) {
  if (value instanceof Response) {
    return {
      status: value.status,
      contentType: value.headers.get('content-type'),
      text: await value.text(),
    }
  }
  if (isAsyncIterable(value)) {
    const events: Array<unknown> = []
    for await (const event of value) events.push(event)
    return { events }
  }
  return { body: value, requestID: isRecord(value) ? value._request_id : null }
}

/** The error that `create` throws, or `undefined`. */
function thrown(create: () => unknown) {
  try {
    create()
    return undefined
  } catch (error) {
    return describeError(error)
  }
}

async function outcome(run: () => Promise<unknown>) {
  try {
    return { value: await unwrap(await run()) }
  } catch (error) {
    return { error: describeError(error) }
  }
}

interface Pair {
  sdk: (fetch: Fetch) => OpenAIClientLike
  ours: (fetch: Fetch) => OpenAIClientLike
}

const BASE = {
  apiKey: 'sk-test',
  organization: 'org_1',
  project: 'proj_1',
  maxRetries: 0,
}

const openaiPair = (options: Partial<ClientOptions> = {}): Pair => ({
  sdk: (fetch) => sdkClient(new OpenAI({ ...BASE, ...options, fetch })),
  ours: (fetch) => createOpenAIClient({ ...BASE, ...options, fetch }),
})

const AZURE = {
  apiKey: 'az-key',
  endpoint: 'https://res.openai.azure.com/',
  apiVersion: '2024-10-21',
  maxRetries: 0,
}

const azurePair = (options: Partial<AzureClientOptions> = {}): Pair => ({
  sdk: (fetch) => sdkClient(new AzureOpenAI({ ...AZURE, ...options, fetch })),
  ours: (fetch) => createAzureOpenAIClient({ ...AZURE, ...options, fetch }),
})

/** Runs `run` on the SDK and on our client against the same replies. */
async function parity(
  run: (client: OpenAIClientLike) => Promise<unknown>,
  replies: Array<Reply>,
  pair = openaiPair(),
) {
  const sdk = recorder(...replies)
  const ours = recorder(...replies)
  const sdkResult = await outcome(() => run(pair.sdk(sdk.fetch)))
  const ourResult = await outcome(() => run(pair.ours(ours.fetch)))
  return {
    sdk: { calls: sdk.calls, ...sdkResult },
    ours: { calls: ours.calls, ...ourResult },
  }
}

const ENV = [
  'OPENAI_API_KEY',
  'OPENAI_ADMIN_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_ORG_ID',
  'OPENAI_PROJECT_ID',
  'OPENAI_CUSTOM_HEADERS',
  'OPENAI_LOG',
  'OPENAI_API_VERSION',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
]

beforeEach(() => {
  for (const name of ENV) vi.stubEnv(name, '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const messages = [{ role: 'user' as const, content: 'Hi' }]
const completion = {
  id: 'c1',
  object: 'chat.completion',
  created: 1,
  model: 'gpt-4o',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Hello' },
      finish_reason: 'stop',
    },
  ],
}
const image = new File(['img'], 'dir/a.png', { type: 'image/png' })
const mask = new File(['mask'], 'mask.png', { type: 'image/png' })
const audio = new File(['wav'], 'audio.wav', { type: 'audio/wav' })

describe('createOpenAIClient parity with the OpenAI SDK', () => {
  it('chat.completions.create sends the same request and parses the same body', async () => {
    const result = await parity(
      (client) => client.chat.completions.create({ model: 'gpt-4o', messages }),
      [json(completion)],
    )
    expect(result.ours).toEqual(result.sdk)
    expect(result.ours.calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer sk-test',
        'content-type': 'application/json',
        'openai-organization': 'org_1',
        'openai-project': 'proj_1',
      },
    })
    expect(result.ours.value).toEqual({ body: completion, requestID: 'req_1' })
  })

  it('chat.completions.create streams chunks and fills a missing finish_reason', async () => {
    const chunk = {
      id: 'c1',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { content: 'He' } }],
    }
    const result = await parity(
      (client) =>
        client.chat.completions.create({
          model: 'gpt-4o',
          messages,
          stream: true,
        }),
      [sse(`data: ${JSON.stringify(chunk)}`, 'data: [DONE]', 'data: {"x":1}')],
    )
    expect(result.ours).toEqual(result.sdk)
    expect(result.ours.value).toEqual({
      events: [
        {
          ...chunk,
          choices: [
            { index: 0, delta: { content: 'He' }, finish_reason: null },
          ],
        },
      ],
    })
  })

  it('throws the same APIError for an SSE data payload with an error', async () => {
    const result = await parity(
      (client) =>
        client.chat.completions.create({
          model: 'gpt-4o',
          messages,
          stream: true,
        }),
      [
        sse(
          'data: {"error":{"message":"boom","type":"server_error","code":"c1"}}',
        ),
      ],
    )
    expect(result.ours).toEqual(result.sdk)
    expect(result.ours.error).toMatchObject({
      name: 'APIError',
      message: 'boom',
      code: 'c1',
      type: 'server_error',
      requestID: 'req_s',
    })
  })

  it('throws the same APIError for an SSE `event: error`', async () => {
    const result = await parity(
      (client) =>
        client.responses.create({ model: 'gpt-4o', input: 'Hi', stream: true }),
      [sse('event: error\ndata: {"message":"bad event","code":"e1"}')],
    )
    expect(result.ours).toEqual(result.sdk)
    expect(result.ours.error).toMatchObject({ name: 'APIError', code: 'e1' })
  })

  it('responses.create adds output_text, streams events, and compact posts', async () => {
    const response = {
      id: 'r1',
      object: 'response',
      output: [
        {
          type: 'message',
          content: [
            { type: 'output_text', text: 'a' },
            { type: 'output_text', text: 'b' },
          ],
        },
      ],
    }
    const nonStream = await parity(
      (client) => client.responses.create({ model: 'gpt-4o', input: 'Hi' }),
      [json(response)],
    )
    expect(nonStream.ours).toEqual(nonStream.sdk)
    expect(nonStream.ours.value).toMatchObject({ body: { output_text: 'ab' } })

    const stream = await parity(
      (client) =>
        client.responses.create({ model: 'gpt-4o', input: 'Hi', stream: true }),
      [
        sse(
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"a"}',
          'event: response.completed\ndata: {"type":"response.completed"}',
        ),
      ],
    )
    expect(stream.ours).toEqual(stream.sdk)
    expect(stream.ours.value).toEqual({
      events: [
        { type: 'response.output_text.delta', delta: 'a' },
        { type: 'response.completed' },
      ],
    })

    const signal = new AbortController().signal
    const compact = await parity(
      (client) =>
        client.responses.compact({ model: 'gpt-4o', input: 'Hi' }, { signal }),
      [json({ id: 'cmp', object: 'response.compaction', output: [] })],
    )
    expect(compact.ours).toEqual(compact.sdk)
    expect(compact.ours.calls[0]?.url).toBe(
      'https://api.openai.com/v1/responses/compact',
    )
  })

  it('embeddings.create asks for base64 and decodes it, or keeps an explicit format', async () => {
    // [1, 2] as little-endian float32.
    const base64 = Buffer.from(new Float32Array([1, 2]).buffer).toString(
      'base64',
    )
    const decoded = await parity(
      (client) =>
        client.embeddings.create({
          model: 'text-embedding-3-small',
          input: 'x',
        }),
      [json({ object: 'list', data: [{ index: 0, embedding: base64 }] })],
    )
    expect(decoded.ours).toEqual(decoded.sdk)
    expect(decoded.ours.calls[0]?.body).toMatchObject({
      encoding_format: 'base64',
    })
    expect(decoded.ours.value).toMatchObject({
      body: { data: [{ embedding: [1, 2] }] },
    })

    const explicit = await parity(
      (client) =>
        client.embeddings.create({
          model: 'text-embedding-3-small',
          input: 'x',
          encoding_format: 'float',
        }),
      [json({ object: 'list', data: [{ index: 0, embedding: [0.5] }] })],
    )
    expect(explicit.ours).toEqual(explicit.sdk)
  })

  it('images.generate posts JSON and images.edit posts the SDK multipart fields', async () => {
    const images = { created: 1, data: [{ b64_json: 'aGk=' }] }
    const generate = await parity(
      (client) =>
        client.images.generate({ model: 'gpt-image-1', prompt: 'cat', n: 1 }),
      [json(images)],
    )
    expect(generate.ours).toEqual(generate.sdk)

    const edit = await parity(
      (client) =>
        client.images.edit({
          model: 'gpt-image-1',
          prompt: 'cat',
          image: [image, image],
          mask,
          n: 2,
        }),
      [json(images)],
    )
    expect(edit.ours).toEqual(edit.sdk)
    expect(edit.ours.calls[0]?.body).toEqual([
      ['image[]', { name: 'a.png', type: 'image/png', text: 'img' }],
      ['image[]', { name: 'a.png', type: 'image/png', text: 'img' }],
      ['mask', { name: 'mask.png', type: 'image/png', text: 'mask' }],
      ['model', 'gpt-image-1'],
      ['n', '2'],
      ['prompt', 'cat'],
    ])
  })

  it('audio.speech returns the raw Response and transcriptions parse by content type', async () => {
    const speech = await parity(
      (client) =>
        client.audio.speech.create({
          model: 'gpt-4o-mini-tts',
          voice: 'alloy',
          input: 'Hi',
        }),
      [bytes('audio/mpeg')],
    )
    expect(speech.ours).toEqual(speech.sdk)
    expect(speech.ours.calls[0]?.headers.accept).toBe(
      'application/octet-stream',
    )
    expect(speech.ours.value).toEqual({
      status: 200,
      contentType: 'audio/mpeg',
      text: 'hi',
    })

    const asText = await parity(
      (client) =>
        client.audio.transcriptions.create({
          model: 'whisper-1',
          file: audio,
          response_format: 'text',
          timestamp_granularities: ['word'],
        }),
      [
        () =>
          new Response('hello world', {
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          }),
      ],
    )
    expect(asText.ours).toEqual(asText.sdk)
    expect(asText.ours.value).toEqual({ body: 'hello world', requestID: null })

    const asJSON = await parity(
      (client) =>
        client.audio.transcriptions.create({ model: 'whisper-1', file: audio }),
      [json({ text: 'hello' })],
    )
    expect(asJSON.ours).toEqual(asJSON.sdk)
  })

  it('files.create, retrieve, and delete match the SDK', async () => {
    const file = { id: 'file/1', object: 'file', purpose: 'user_data' }
    const created = await parity(
      (client) => client.files.create({ file: audio, purpose: 'user_data' }),
      [json(file)],
    )
    expect(created.ours).toEqual(created.sdk)

    const retrieved = await parity(
      (client) => client.files.retrieve('file/1'),
      [json(file)],
    )
    expect(retrieved.ours).toEqual(retrieved.sdk)
    expect(retrieved.ours.calls[0]).toMatchObject({
      method: 'GET',
      url: 'https://api.openai.com/v1/files/file%2F1',
    })

    const deleted = await parity(
      (client) => client.files.delete('file-1'),
      [json({ id: 'file-1', deleted: true })],
    )
    expect(deleted.ours).toEqual(deleted.sdk)
    expect(deleted.ours.calls[0]?.method).toBe('DELETE')
  })

  it('videos.create, retrieve, and downloadContent match the SDK', async () => {
    const video = { id: 'v1', object: 'video', status: 'queued' }
    const created = await parity(
      (client) =>
        client.videos.create({
          prompt: 'waves',
          model: 'sora-2',
          seconds: '4',
          input_reference: image,
        }),
      [json(video)],
    )
    expect(created.ours).toEqual(created.sdk)

    const retrieved = await parity(
      (client) => client.videos.retrieve('v1'),
      [json(video)],
    )
    expect(retrieved.ours).toEqual(retrieved.sdk)

    const content = await parity(
      (client) => client.videos.downloadContent('v1', { variant: 'thumbnail' }),
      [bytes('image/webp')],
    )
    expect(content.ours).toEqual(content.sdk)
    expect(content.ours.calls[0]?.url).toBe(
      'https://api.openai.com/v1/videos/v1/content?variant=thumbnail',
    )
  })

  it('decisions.create and post() match the SDK', async () => {
    const decision = await parity(
      (client) =>
        client.decisions.create({ model: 'gpt-4o', input: 'x', questions: [] }),
      [json({ id: 'd1' })],
    )
    expect(decision.ours).toEqual(decision.sdk)

    const posted = await parity(
      (client) =>
        client.post('/files/f1/public-url', {
          body: {},
          headers: { 'X-A': 'b' },
        }),
      [json({ url: 'https://x.test/f1' })],
    )
    expect(posted.ours).toEqual(posted.sdk)
    expect(posted.ours.value).toMatchObject({
      body: { url: 'https://x.test/f1' },
    })
  })

  it('merges default and per-request headers, and a null removes a header', async () => {
    const result = await parity(
      (client) =>
        client.chat.completions.create(
          { model: 'gpt-4o', messages },
          {
            headers: { 'OpenAI-Organization': null, 'X-Request': 'r' },
            timeout: 5000,
          },
        ),
      [json(completion)],
      openaiPair({
        defaultHeaders: { 'X-Default': 'd', 'OpenAI-Project': null },
        defaultQuery: { tenant: 't1' },
      }),
    )
    expect(result.ours).toEqual(result.sdk)
    expect(result.ours.calls[0]?.headers).not.toHaveProperty(
      'openai-organization',
    )
    expect(result.ours.calls[0]?.headers).not.toHaveProperty('openai-project')
    expect(result.ours.calls[0]?.url).toBe(
      'https://api.openai.com/v1/chat/completions?tenant=t1',
    )
  })

  it('reads OPENAI_BASE_URL, OPENAI_ORG_ID, and OPENAI_PROJECT_ID like the SDK', async () => {
    vi.stubEnv('OPENAI_BASE_URL', 'https://proxy.test/v1')
    vi.stubEnv('OPENAI_ORG_ID', 'org_env')
    vi.stubEnv('OPENAI_PROJECT_ID', 'proj_env')
    const result = await parity(
      (client) => client.chat.completions.create({ model: 'gpt-4o', messages }),
      [json(completion)],
      openaiPair({ organization: undefined, project: undefined }),
    )
    expect(result.ours).toEqual(result.sdk)
    expect(result.ours.calls[0]).toMatchObject({
      url: 'https://proxy.test/v1/chat/completions',
      headers: {
        'openai-organization': 'org_env',
        'openai-project': 'proj_env',
      },
    })
    expect(createOpenAIClient({ apiKey: 'k' }).baseURL).toBe(
      'https://proxy.test/v1',
    )
  })

  it.each([
    { status: 400, body: { error: { message: 'bad', param: 'model' } } },
    { status: 500, body: { message: 'no error key' } },
    { status: 404, body: 'not json' },
  ])(
    'throws the same error class and fields for a $status',
    async ({ status, body }) => {
      const result = await parity(
        (client) =>
          client.chat.completions.create({ model: 'gpt-4o', messages }),
        [
          typeof body === 'string'
            ? () =>
                new Response(body, {
                  status,
                  headers: { 'x-request-id': 'req_e' },
                })
            : json(body, status),
        ],
      )
      expect(result.ours).toEqual(result.sdk)
      expect(result.ours.error).toHaveProperty('status', status)
    },
  )

  it('throws real SDK error classes', async () => {
    const run = (status: number) =>
      createOpenAIClient({
        ...BASE,
        fetch: recorder(json({ error: { message: 'x' } }, status)).fetch,
      }).chat.completions.create({ model: 'gpt-4o', messages })
    await expect(run(400)).rejects.toBeInstanceOf(BadRequestError)
    await expect(run(500)).rejects.toBeInstanceOf(InternalServerError)
  })

  it('waits for retry-after-ms and retries like the SDK with maxRetries 1', async () => {
    const limited = json({ error: { message: 'slow' } }, 429, {
      'retry-after-ms': '10',
    })
    const retried = await parity(
      (client) => client.chat.completions.create({ model: 'gpt-4o', messages }),
      [limited, json(completion)],
      openaiPair({ maxRetries: 1 }),
    )
    expect(retried.ours).toEqual(retried.sdk)
    expect(retried.ours.calls).toHaveLength(2)

    const exhausted = await parity(
      (client) => client.chat.completions.create({ model: 'gpt-4o', messages }),
      [limited],
      openaiPair({ maxRetries: 1 }),
    )
    expect(exhausted.ours).toEqual(exhausted.sdk)
    expect(exhausted.ours.calls).toHaveLength(2)
    expect(exhausted.ours.error).toMatchObject({ name: RateLimitError.name })
  })

  it('withOptions({ fetch }) sends through the new fetch', async () => {
    const run = async (make: (fetch: Fetch) => OpenAIClientLike) => {
      const first = recorder(json(completion))
      const second = recorder(json(completion))
      await make(first.fetch)
        .withOptions({ fetch: second.fetch })
        .chat.completions.create({ model: 'gpt-4o', messages })
      return { first: first.calls, second: second.calls }
    }
    const pair = openaiPair()
    const ours = await run(pair.ours)
    expect(ours).toEqual(await run(pair.sdk))
    expect(ours.first).toHaveLength(0)
    expect(ours.second).toHaveLength(1)
  })

  it('calls an apiKey function before each request, like the SDK', async () => {
    let calls = 0
    const apiKey = async () => `sk-from-fn-${++calls}`
    const result = await parity(
      async (client) => {
        await client.chat.completions.create({ model: 'gpt-4o', messages })
        return client.chat.completions.create({ model: 'gpt-4o', messages })
      },
      [json(completion), json(completion)],
      openaiPair({ apiKey }),
    )
    // The SDK and our client share the counter: SDK calls 1-2, ours 3-4.
    const auth = (side: typeof result.sdk) =>
      side.calls.map((call) => call.headers.authorization)
    expect(auth(result.sdk)).toEqual([
      'Bearer sk-from-fn-1',
      'Bearer sk-from-fn-2',
    ])
    expect(auth(result.ours)).toEqual([
      'Bearer sk-from-fn-3',
      'Bearer sk-from-fn-4',
    ])
    const withoutAuth = (side: typeof result.sdk) => ({
      ...side,
      calls: side.calls.map(
        ({ headers: { authorization: _, ...headers }, ...call }) => ({
          ...call,
          headers,
        }),
      ),
    })
    expect(withoutAuth(result.ours)).toEqual(withoutAuth(result.sdk))
  })

  it('throws the same error when the apiKey function fails', async () => {
    const result = await parity(
      (client) => client.chat.completions.create({ model: 'gpt-4o', messages }),
      [json(completion)],
      openaiPair({
        apiKey: async () => {
          throw new Error('vault down')
        },
      }),
    )
    expect(result.ours.error).toEqual(result.sdk.error)
    expect(result.ours.calls).toHaveLength(0)
  })

  it('throws the same errors for missing credentials and a browser', () => {
    const missing = { ...BASE, apiKey: undefined }
    expect(thrown(() => createOpenAIClient(missing))).toEqual(
      thrown(() => new OpenAI(missing)),
    )
    expect(thrown(() => createOpenAIClient(missing))).toMatchObject({
      name: 'OpenAIError',
    })

    vi.stubGlobal('window', { document: {} })
    expect(thrown(() => createOpenAIClient(BASE))).toEqual(
      thrown(() => new OpenAI(BASE)),
    )
    expect(thrown(() => createOpenAIClient(BASE))).toMatchObject({
      message: expect.stringContaining('browser-like environment'),
    })
    expect(
      thrown(() =>
        createOpenAIClient({ ...BASE, dangerouslyAllowBrowser: true }),
      ),
    ).toBeUndefined()
  })
})

describe('createAzureOpenAIClient parity with AzureOpenAI', () => {
  it('puts the deployment in the path and sends api-key and api-version', async () => {
    const result = await parity(
      (client) => client.chat.completions.create({ model: 'gpt-4o', messages }),
      [json(completion)],
      azurePair({ deployment: 'dep-1' }),
    )
    expect(result.ours).toEqual(result.sdk)
    expect(result.ours.calls[0]).toMatchObject({
      url: 'https://res.openai.azure.com/openai/deployments/dep-1/chat/completions?api-version=2024-10-21',
      headers: { 'api-key': 'az-key' },
      redirect: 'manual',
    })
    expect(result.ours.calls[0]?.headers).not.toHaveProperty('authorization')
  })

  it('uses the multipart model as the deployment', async () => {
    const result = await parity(
      (client) =>
        client.audio.transcriptions.create({ model: 'whisper-1', file: audio }),
      [json({ text: 'hi' })],
      azurePair(),
    )
    expect(result.ours).toEqual(result.sdk)
    expect(result.ours.calls[0]?.url).toBe(
      'https://res.openai.azure.com/openai/deployments/whisper-1/audio/transcriptions?api-version=2024-10-21',
    )
  })

  it('keeps /responses on a v1 base URL', async () => {
    const result = await parity(
      (client) => client.responses.create({ model: 'dep', input: 'Hi' }),
      [json({ id: 'r1', object: 'response', output: [] })],
      azurePair({
        endpoint: undefined,
        baseURL: 'https://res.openai.azure.com/openai/v1',
        apiVersion: 'v1',
      }),
    )
    expect(result.ours).toEqual(result.sdk)
    expect(result.ours.calls[0]?.url).toBe(
      'https://res.openai.azure.com/openai/v1/responses?api-version=v1',
    )
  })

  it('sends through the real AzureOpenAI for azureADTokenProvider', async () => {
    const result = await parity(
      (client) => client.chat.completions.create({ model: 'gpt-4o', messages }),
      [json(completion)],
      azurePair({ apiKey: undefined, azureADTokenProvider: async () => 'tok' }),
    )
    expect(result.ours).toEqual(result.sdk)
    expect(result.ours.calls[0]?.headers.authorization).toBe('Bearer tok')
  })

  it('throws the same errors for a missing apiVersion or endpoint', () => {
    const noVersion = { ...AZURE, apiVersion: undefined }
    expect(thrown(() => createAzureOpenAIClient(noVersion))).toEqual(
      thrown(() => new AzureOpenAI(noVersion)),
    )
    const noEndpoint = { ...AZURE, endpoint: undefined }
    expect(thrown(() => createAzureOpenAIClient(noEndpoint))).toEqual(
      thrown(() => new AzureOpenAI(noEndpoint)),
    )
    expect(thrown(() => createAzureOpenAIClient(noEndpoint))).toMatchObject({
      name: 'OpenAIError',
    })
  })
})
