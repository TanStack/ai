import { describe, expect, it } from 'vitest'
import { HTTPClient, OpenRouter } from '@openrouter/sdk'
import { createOpenRouterClient } from '../src/client'
import type { SDKOptions } from '@openrouter/sdk'
import type { OpenRouterClient } from '../src/client'

// The real SDK is the oracle. Both clients run against the same fake network
// and must send the same request and give back the same result or error.

interface SentRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

type Respond = (
  request: Request,
  attempt: number,
) => Response | Promise<Response>

/** Headers we do not send on purpose: SDK telemetry and the empty cookie. */
const IGNORED_HEADERS = new Set(['user-agent', 'cookie'])

async function record(request: Request): Promise<SentRequest> {
  const text = await request.clone().text()
  return {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(
      [...request.headers].filter(([name]) => !IGNORED_HEADERS.has(name)),
    ),
    body: text ? JSON.parse(text) : undefined,
  }
}

/** Runs `run` on the SDK and on our client. Gives back both sides. */
async function both<T>(
  options: Omit<SDKOptions, 'httpClient'>,
  respond: Respond,
  run: (client: OpenRouterClient) => Promise<T>,
) {
  const side = async (make: (httpClient: HTTPClient) => OpenRouterClient) => {
    const sent: Array<SentRequest> = []
    const httpClient = new HTTPClient({
      fetcher: async (input) => {
        if (!(input instanceof Request)) throw new Error('Expected a Request')
        sent.push(await record(input))
        return respond(input, sent.length)
      },
    })
    const client = make(httpClient)
    const result = await run(client).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
    return { sent, result }
  }
  const sdk = await side(
    (httpClient) => new OpenRouter({ ...options, httpClient }),
  )
  const ours = await side((httpClient) =>
    createOpenRouterClient({ ...options, httpClient }),
  )
  return { sdk, ours }
}

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function sse(events: Array<unknown>) {
  const text = events
    .map(
      (event) =>
        `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`,
    )
    .join('')
  return new Response(`: keep-alive\n\n${text}data: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

async function collect(stream: AsyncIterable<unknown>) {
  const items: Array<unknown> = []
  for await (const item of stream) items.push(item)
  return items
}

/** The fields of an SDK error that callers read. */
function errorFields(error: unknown) {
  if (!(error instanceof Error)) return { notAnError: error }
  const fields: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  }
  for (const key of [
    'statusCode',
    'body',
    'error',
    'openrouterMetadata',
    'userId',
    'contentType',
  ]) {
    if (key in error) fields[key] = Reflect.get(error, key)
  }
  if ('headers' in error && error.headers instanceof Headers) {
    fields.headers = Object.fromEntries(error.headers)
  }
  if (error.cause instanceof Error) fields.cause = error.cause.name
  return fields
}

const options = {
  apiKey: 'sk-or-test',
  httpReferer: 'https://app.example.com',
  appTitle: 'Test App',
  appCategories: 'chat',
  retryConfig: { strategy: 'none' as const },
}

const chatWire = {
  id: 'gen-1',
  object: 'chat.completion',
  created: 1,
  model: 'openai/gpt-5.5',
  system_fingerprint: null,
  choices: [
    {
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content: 'Hi', reasoning_details: [] },
    },
  ],
  usage: {
    prompt_tokens: 3,
    completion_tokens: 1,
    total_tokens: 4,
    cost: 0.1,
    prompt_tokens_details: { cached_tokens: 1 },
  },
}

const chatRequest = {
  model: 'openai/gpt-5.5',
  messages: [{ role: 'user' as const, content: 'Hi' }],
  maxCompletionTokens: 10,
  provider: { dataCollection: 'deny' as const },
}

describe('OpenRouter client parity with the SDK', () => {
  it('sends a chat request and reads the result', async () => {
    const { sdk, ours } = await both(
      options,
      () => json(chatWire),
      (client) =>
        client.chat.send({ chatRequest }, { headers: { 'x-trace': 't1' } }),
    )
    expect(ours.sent).toEqual(sdk.sent)
    expect(ours.result).toEqual(sdk.result)
    expect(ours.sent[0]?.url).toBe(
      'https://openrouter.ai/api/v1/chat/completions',
    )
  })

  it('streams chat chunks', async () => {
    const chunk = {
      id: 'gen-1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'openai/gpt-5.5',
      choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }],
    }
    const { sdk, ours } = await both(
      { ...options, apiKey: async () => 'sk-or-async' },
      () => sse([chunk, { ...chunk, choices: [], usage: chatWire.usage }]),
      async (client) =>
        collect(
          await client.chat.send({
            chatRequest: { ...chatRequest, stream: true },
          }),
        ),
    )
    expect(ours.sent).toEqual(sdk.sent)
    expect(ours.result).toEqual(sdk.result)
  })

  it('streams responses events, with the SDK fallback for odd events', async () => {
    const events = [
      {
        type: 'response.output_text.delta',
        sequence_number: 1,
        item_id: 'm',
        output_index: 0,
        content_index: 0,
        delta: 'Hi',
        logprobs: [],
      },
      {
        type: 'response.output_text.delta',
        item_id: 'm',
        output_index: 0,
        content_index: 0,
        delta: '!',
      },
      { type: 'response.new_kind', sequence_number: 2 },
    ]
    const { sdk, ours } = await both(
      { ...options, serverURL: 'https://proxy.example.com/v1/' },
      () => sse(events),
      async (client) =>
        collect(
          await client.beta.responses.send({
            responsesRequest: {
              model: 'openai/gpt-5.5',
              input: 'Hi',
              stream: true,
            },
          }),
        ),
    )
    expect(ours.sent).toEqual(sdk.sent)
    expect(ours.result).toEqual(sdk.result)
  })

  it('sends a rerank request and reads the result', async () => {
    const { sdk, ours } = await both(
      options,
      () =>
        json({
          id: 'rr',
          model: 'cohere/rerank-v3.5',
          results: [
            { index: 0, relevance_score: 0.5, document: { text: 'a' } },
          ],
          usage: { total_tokens: 2, search_units: 1 },
        }),
      (client) =>
        client.rerank.rerank({
          requestBody: {
            model: 'cohere/rerank-v3.5',
            query: 'q',
            documents: ['a'],
            topN: 1,
          },
        }),
    )
    expect(ours.sent).toEqual(sdk.sent)
    expect(ours.result).toEqual(sdk.result)
  })

  it('creates, polls, and downloads a video', async () => {
    const job = {
      id: 'job/1',
      polling_url: 'https://openrouter.ai/api/v1/videos/job_1',
      status: 'completed',
      unsigned_urls: ['https://openrouter.ai/api/v1/videos/job_1/content'],
    }
    const respond: Respond = (request) => {
      if (request.method === 'POST') return json(job, 202)
      if (request.url.includes('/content')) {
        return new Response('MP4', { headers: { 'content-type': 'video/mp4' } })
      }
      return json(job)
    }
    const { sdk, ours } = await both(options, respond, async (client) => {
      const created = await client.videoGeneration.generate({
        videoGenerationRequest: {
          model: 'google/veo-3.1',
          prompt: 'a cat',
          aspectRatio: '16:9',
        },
      })
      const polled = await client.videoGeneration.getGeneration({
        jobId: created.id,
      })
      const content = await client.videoGeneration.getVideoContent({
        jobId: created.id,
      })
      return { created, polled, bytes: await new Response(content).text() }
    })
    expect(ours.sent).toEqual(sdk.sent)
    expect(ours.result).toEqual(sdk.result)
  })

  it.each([
    [
      'a typed JSON error',
      () =>
        json(
          {
            error: { code: 400, message: 'Bad model', metadata: { a: 1 } },
            user_id: 'u1',
          },
          400,
        ),
    ],
    [
      'a typed error with no message',
      () => json({ error: { code: 402, message: '' } }, 402),
    ],
    [
      'a JSON error with no typed class',
      () => json({ error: { code: 418, message: 'teapot' } }, 418),
    ],
    [
      'a text error',
      () =>
        new Response('upstream down', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        }),
    ],
    [
      'an unexpected content type',
      () =>
        new Response('<html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    ],
  ])('throws the same error for %s', async (_, respond) => {
    const { sdk, ours } = await both(options, respond, (client) =>
      client.chat.send({ chatRequest }),
    )
    expect('error' in sdk.result).toBe(true)
    expect(errorFields(Reflect.get(ours.result, 'error'))).toEqual(
      errorFields(Reflect.get(sdk.result, 'error')),
    )
  })

  it('rejects a JSON result with a missing key, as the SDK validation does', async () => {
    const { sdk, ours } = await both(
      options,
      () => json({ id: 'gen-1', model: 'm' }),
      (client) => client.chat.send({ chatRequest }),
    )
    // The SDK also sets `cause` to its ZodError. We have no zod.
    const { cause: _, ...sdkFields } = errorFields(
      Reflect.get(sdk.result, 'error'),
    )
    expect(errorFields(Reflect.get(ours.result, 'error'))).toEqual(sdkFields)
    expect(sdkFields.name).toBe('ResponseValidationError')
  })

  it('retries a status from retryCodes with the backoff config', async () => {
    const respond: Respond = (_, attempt) =>
      attempt < 3
        ? json({ error: { code: 429, message: 'slow' } }, 429, {
            'retry-after': '0',
          })
        : json(chatWire)
    const { sdk, ours } = await both(
      {
        ...options,
        retryConfig: {
          strategy: 'backoff',
          backoff: {
            initialInterval: 1,
            maxInterval: 1,
            exponent: 1,
            maxElapsedTime: 5000,
          },
          retryConnectionErrors: false,
        },
      },
      respond,
      (client) => client.chat.send({ chatRequest }, { retryCodes: ['429'] }),
    )
    expect(ours.sent).toHaveLength(3)
    expect(ours.sent).toEqual(sdk.sent)
    expect(ours.result).toEqual(sdk.result)
  })

  it.each([
    [
      'a connection error',
      () => {
        throw new TypeError('fetch failed')
      },
    ],
    [
      'an abort',
      () => {
        throw new DOMException('aborted', 'AbortError')
      },
    ],
    [
      'a timeout',
      () => {
        throw new DOMException('timed out', 'TimeoutError')
      },
    ],
    [
      'another error',
      () => {
        throw new Error('boom')
      },
    ],
  ])('wraps %s in the same client error', async (_, respond) => {
    const { sdk, ours } = await both(options, respond, (client) =>
      client.chat.send({ chatRequest }),
    )
    expect(errorFields(Reflect.get(ours.result, 'error'))).toEqual(
      errorFields(Reflect.get(sdk.result, 'error')),
    )
  })
})
