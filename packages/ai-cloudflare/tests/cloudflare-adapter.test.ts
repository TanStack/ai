import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  cloudflareGateway,
  createCloudflareEmbedding,
  createCloudflareImage,
  createCloudflareSummarize,
  createCloudflareText,
  createCloudflareTranscription,
  createCloudflareTTS,
} from '../src/index'
import {
  normalizeErrorResponse,
  normalizeSseResponse,
} from '../src/utils/fetch'
import type { Ai } from '@cloudflare/workers-types'
import type { StreamChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)

type RunHandler = (
  model: string,
  inputs: Record<string, unknown>,
  options?: Record<string, unknown>,
) => unknown

function fakeBinding(handler: RunHandler) {
  const run = vi.fn(handler)
  return { binding: { run, gateway: () => ({}) } as unknown as Ai, run }
}

function sse(events: Array<unknown>): Response {
  const body = events
    .map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`)
    .join('')
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

const chunk = (
  delta: Record<string, unknown>,
  finish: string | null = null,
) => ({
  id: 'chatcmpl-1',
  object: 'chat.completion.chunk',
  model: '@cf/test',
  choices: [{ index: 0, delta, finish_reason: finish }],
})

// Mirrors the live binding stream: OpenAI chunks, then a usage-only trailer
// with no `choices`, then [DONE].
const chatStreamEvents = [
  chunk({ role: 'assistant', content: '' }),
  chunk({ content: 'Hello' }),
  chunk({ content: ' there' }),
  chunk({}, 'stop'),
  {
    response: '',
    usage: { prompt_tokens: 41, completion_tokens: 4, total_tokens: 45 },
  },
  '[DONE]',
]

async function collect(iterable: AsyncIterable<StreamChunk>) {
  const chunks: Array<StreamChunk> = []
  for await (const c of iterable) chunks.push(c)
  return chunks
}

describe('normalizeSseResponse', () => {
  it('gives events without choices an empty choices array', async () => {
    const out = normalizeSseResponse(sse(chatStreamEvents))
    const text = await out.text()
    expect(text).toContain('"usage":{"prompt_tokens":41')
    expect(text).toContain('"choices":[]')
    expect(text).toContain('data: [DONE]')
    expect(text).toContain('"content":"Hello"')
  })

  it('rewraps Cloudflare error envelopes into the OpenAI error shape', async () => {
    const wrapped = await normalizeErrorResponse(
      new Response(
        JSON.stringify({
          name: 'AiError',
          internalCode: 5006,
          message: 'Bad input',
        }),
        { status: 400 },
      ),
    )
    expect(wrapped.status).toBe(400)
    expect(await wrapped.json()).toEqual({
      error: { message: 'Bad input', type: 'AiError', code: 5006 },
    })
    const envelope = await normalizeErrorResponse(
      new Response(
        JSON.stringify({ errors: [{ code: 2021, message: 'No credit' }] }),
        {
          status: 402,
        },
      ),
    )
    expect(await envelope.json()).toMatchObject({
      error: { message: 'No credit', code: 2021 },
    })
  })

  it('leaves non-SSE responses alone', () => {
    const json = new Response('{}', {
      headers: { 'content-type': 'application/json' },
    })
    expect(normalizeSseResponse(json)).toBe(json)
  })
})

describe('text adapter (binding)', () => {
  it('streams through env.AI.run and reports trailer usage', async () => {
    const { binding, run } = fakeBinding(() => sse(chatStreamEvents))
    const adapter = createCloudflareText('@cf/test', {
      binding,
      gateway: { id: 'g1', cacheTtl: 60 },
    })

    const chunks = await collect(
      adapter.chatStream({
        model: '@cf/test',
        messages: [{ role: 'user', content: 'Hi' }],
        modelOptions: { temperature: 0.2 },
        logger,
      }),
    )

    const [model, inputs, options] = run.mock.calls[0]!
    expect(model).toBe('@cf/test')
    expect(inputs).toMatchObject({
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
      temperature: 0.2,
    })
    expect(inputs).not.toHaveProperty('model')
    expect(options).toEqual({
      returnRawResponse: true,
      gateway: { id: 'g1', cacheTtl: 60 },
    })

    const text = chunks
      .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
      .map((c) => (c as { delta: string }).delta)
      .join('')
    expect(text).toBe('Hello there')
    const finished = chunks.find((c) => c.type === 'RUN_FINISHED') as {
      usage?: { promptTokens: number; totalTokens: number }
    }
    expect(finished.usage).toMatchObject({ promptTokens: 41, totalTokens: 45 })
  })

  it('surfaces reasoning_content as reasoning events', async () => {
    const { binding } = fakeBinding(() =>
      sse([
        chunk({ role: 'assistant', reasoning_content: 'thinking' }),
        chunk({ content: '4' }),
        chunk({}, 'stop'),
        '[DONE]',
      ]),
    )
    const adapter = createCloudflareText('@cf/test', { binding })
    const chunks = await collect(
      adapter.chatStream({
        model: '@cf/test',
        messages: [{ role: 'user', content: '2+2?' }],
        logger,
      }),
    )
    const reasoning = chunks.find((c) => c.type === 'REASONING_MESSAGE_CONTENT')
    expect(reasoning).toMatchObject({ delta: 'thinking' })
  })

  it('returns structured output from a JSON response', async () => {
    const { binding, run } = fakeBinding(() =>
      Response.json({
        id: 'x',
        choices: [
          { index: 0, message: { role: 'assistant', content: '{"age":30}' } },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    )
    const adapter = createCloudflareText('@cf/test', { binding })
    const result = await adapter.structuredOutput({
      outputSchema: {
        type: 'object',
        properties: { age: { type: 'number' } },
        required: ['age'],
      },
      chatOptions: {
        model: '@cf/test',
        messages: [{ role: 'user', content: 'age?' }],
        logger,
      },
    })
    expect(result.data).toEqual({ age: 30 })
    expect(run.mock.calls[0]![1]).toMatchObject({
      response_format: { type: 'json_schema' },
    })
  })
})

describe('text adapter (binding) message shapes', () => {
  it('sends tool-call-only assistant turns with empty string content', async () => {
    const { binding, run } = fakeBinding(() => sse(chatStreamEvents))
    const adapter = createCloudflareText('@cf/test', { binding })
    await collect(
      adapter.chatStream({
        model: '@cf/test',
        messages: [
          { role: 'user', content: 'Weather?' },
          {
            role: 'assistant',
            content: null,
            toolCalls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city":"Paris"}',
                },
              },
            ],
          },
          { role: 'tool', toolCallId: 'call_1', content: '{"temp":21}' },
        ],
        logger,
      }),
    )
    const inputs = run.mock.calls[0]![1] as {
      messages: Array<{ role: string; content: unknown }>
    }
    expect(inputs.messages[1]).toMatchObject({ role: 'assistant', content: '' })
    expect(inputs.messages[2]).toMatchObject({
      role: 'tool',
      content: '{"temp":21}',
    })
  })

  it('surfaces Cloudflare error bodies through the SDK error', async () => {
    const { binding } = fakeBinding(
      () =>
        new Response(
          JSON.stringify({ name: 'AiError', message: 'Bad input' }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        ),
    )
    const adapter = createCloudflareText('@cf/test', { binding })
    const chunks = await collect(
      adapter.chatStream({
        model: '@cf/test',
        messages: [{ role: 'user', content: 'Hi' }],
        logger,
      }),
    )
    const error = chunks.find((c) => c.type === 'RUN_ERROR') as {
      message: string
    }
    expect(error.message).toContain('Bad input')
  })
})

describe('text adapter (REST)', () => {
  it('targets the account chat endpoint with token and gateway headers', async () => {
    const fetchMock = vi.fn(async () => sse(chatStreamEvents))
    const adapter = createCloudflareText('@cf/test', {
      accountId: 'acc',
      apiKey: 'tok',
      gateway: { id: 'g1', skipCache: true },
      fetch: fetchMock,
    })
    await collect(
      adapter.chatStream({
        model: '@cf/test',
        messages: [{ role: 'user', content: 'Hi' }],
        logger,
      }),
    )
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(String(url)).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc/ai/v1/chat/completions',
    )
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBe('Bearer tok')
    expect(headers.get('cf-aig-gateway-id')).toBe('g1')
    expect(headers.get('cf-aig-skip-cache')).toBe('true')
  })
})

describe('summarize', () => {
  it('wraps the text adapter under the cloudflare name', () => {
    const { binding } = fakeBinding(() => sse(chatStreamEvents))
    const adapter = createCloudflareSummarize('@cf/test', { binding })
    expect(adapter.name).toBe('cloudflare')
    expect(adapter.kind).toBe('summarize')
  })
})

describe('embedding adapter', () => {
  it('maps native embeddings output', async () => {
    const { binding, run } = fakeBinding(() => ({
      data: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
    }))
    const adapter = createCloudflareEmbedding('@cf/baai/bge-m3', { binding })
    const result = await adapter.createEmbeddings({
      model: '@cf/baai/bge-m3',
      input: ['a', 'b'],
      logger,
    })
    expect(run).toHaveBeenCalledWith(
      '@cf/baai/bge-m3',
      { text: ['a', 'b'] },
      undefined,
    )
    expect(result.embeddings).toEqual([
      { vector: [0.1, 0.2], index: 0 },
      { vector: [0.3, 0.4], index: 1 },
    ])
  })

  it('uses the REST /ai/run endpoint and unwraps result', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ success: true, result: { data: [[1]] } }),
    )
    const adapter = createCloudflareEmbedding('@cf/baai/bge-m3', {
      accountId: 'acc',
      apiKey: 'tok',
      fetch: fetchMock,
    })
    const result = await adapter.createEmbeddings({
      model: '@cf/baai/bge-m3',
      input: ['a'],
      logger,
    })
    const [url] = fetchMock.mock.calls[0] as unknown as [URL]
    expect(String(url)).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc/ai/run/@cf/baai/bge-m3',
    )
    expect(result.embeddings[0]?.vector).toEqual([1])
  })
})

describe('image adapter', () => {
  it('returns base64 from JSON and from raw bytes', async () => {
    const jsonBinding = fakeBinding(() => ({ image: 'QUJD' }))
    const json = await createCloudflareImage('@cf/flux', {
      binding: jsonBinding.binding,
    }).generateImages({
      model: '@cf/flux',
      prompt: 'a cat',
      size: '512x256',
      modelOptions: { steps: 4 },
      logger,
    })
    expect(json.images[0]?.b64Json).toBe('QUJD')
    expect(jsonBinding.run.mock.calls[0]![1]).toEqual({
      prompt: 'a cat',
      width: 512,
      height: 256,
      steps: 4,
    })

    const bytesBinding = fakeBinding(() => new Uint8Array([65, 66, 67]))
    const bytes = await createCloudflareImage('@cf/sdxl', {
      binding: bytesBinding.binding,
    }).generateImages({ model: '@cf/sdxl', prompt: 'a cat', logger })
    expect(bytes.images[0]?.b64Json).toBe('QUJD')
  })
})

describe('tts adapter', () => {
  it('maps voice and format and base64-encodes streamed audio', async () => {
    const { binding, run } = fakeBinding(
      () => new Response(new Uint8Array([65, 66, 67])).body,
    )
    const adapter = createCloudflareTTS('@cf/deepgram/aura-2-en', { binding })
    const result = await adapter.generateSpeech({
      model: '@cf/deepgram/aura-2-en',
      text: 'Hello',
      voice: 'luna',
      format: 'mp3',
      logger,
    })
    expect(run.mock.calls[0]![1]).toEqual({
      text: 'Hello',
      speaker: 'luna',
      encoding: 'mp3',
    })
    expect(result).toMatchObject({
      audio: 'QUJD',
      format: 'mp3',
      contentType: 'audio/mpeg',
    })
  })
})

describe('transcription adapter', () => {
  it('sends base64 audio to whisper and maps segments', async () => {
    const { binding, run } = fakeBinding(() => ({
      text: 'Hello there.',
      transcription_info: { language: 'en', duration: 1.05 },
      segments: [{ start: 0, end: 0.78, text: ' Hello there.' }],
      words: [{ word: ' Hello', start: 0, end: 0.6 }],
    }))
    const adapter = createCloudflareTranscription(
      '@cf/openai/whisper-large-v3-turbo',
      { binding },
    )
    const result = await adapter.transcribe({
      model: '@cf/openai/whisper-large-v3-turbo',
      audio: new Uint8Array([65, 66, 67]).buffer,
      language: 'en',
      logger,
    })
    expect(run.mock.calls[0]![1]).toEqual({ audio: 'QUJD', language: 'en' })
    expect(result).toMatchObject({
      text: 'Hello there.',
      language: 'en',
      duration: 1.05,
      segments: [{ id: 0, start: 0, end: 0.78, text: 'Hello there.' }],
      words: [{ word: 'Hello', start: 0, end: 0.6 }],
    })
  })

  it('sends raw bytes to Deepgram Nova over REST', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        result: {
          results: {
            channels: [{ alternatives: [{ transcript: 'hi', words: [] }] }],
          },
        },
      }),
    )
    const adapter = createCloudflareTranscription('@cf/deepgram/nova-3', {
      accountId: 'acc',
      apiKey: 'tok',
      fetch: fetchMock,
    })
    const result = await adapter.transcribe({
      model: '@cf/deepgram/nova-3',
      audio: new Blob([new Uint8Array([1, 2])], { type: 'audio/wav' }),
      logger,
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toContain('/ai/run/@cf/deepgram/nova-3')
    expect(new Headers(init.headers).get('content-type')).toBe('audio/wav')
    expect(init.body).toBeInstanceOf(ArrayBuffer)
    expect(result.text).toBe('hi')
  })
})

describe('cloudflareGateway', () => {
  it('builds the provider base URL and cf-aig headers', () => {
    const gateway = cloudflareGateway('openai', {
      accountId: 'acc',
      gatewayId: 'prod',
      cfApiKey: 'cf-token',
      cacheTtl: 30,
    })
    expect(gateway.baseURL).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc/prod/openai',
    )
    expect(gateway.headers).toEqual({
      'cf-aig-cache-ttl': '30',
      'cf-aig-authorization': 'Bearer cf-token',
    })
  })
})
