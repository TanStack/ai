import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { AnthropicTextAdapter } from '@tanstack/ai-anthropic'
import { createNeonText, neonText } from '../src/adapters/factory'
import { NeonTextAdapter } from '../src/adapters/text'
import { NeonResponsesTextAdapter } from '../src/adapters/responses-text'
import type { TextOptions } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const messages = [{ role: 'user' as const, content: 'Hi' }]
const HOST = 'https://br-test-api.ai.c-1.us-east-2.aws.neon.tech'

/** A fetch that records each request and answers with an empty stream. */
function captureFetch() {
  const sent: Array<{ url: string; headers: Headers; body: any }> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    sent.push({
      url: request.url,
      headers: request.headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    return new Response('', {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  return { fetch, sent }
}

async function drain(
  adapter: { chatStream: (options: TextOptions) => AsyncIterable<unknown> },
  model: string,
  extra: Partial<TextOptions> = {},
) {
  for await (const _ of adapter.chatStream({
    logger,
    model,
    messages,
    ...extra,
  })) {
    // drain
  }
}

describe('neon text routing', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sends Claude to the Anthropic Messages route with a bearer token', async () => {
    const { fetch, sent } = captureFetch()
    const adapter = createNeonText('claude-sonnet-5-5', 'nt-test', {
      baseURL: HOST,
      fetch,
    })
    expect(adapter).toBeInstanceOf(AnthropicTextAdapter)
    expect(adapter.provider).toBe('neon')

    await drain(adapter, 'claude-sonnet-5-5')

    expect(sent).toHaveLength(1)
    // The SDK's beta client adds `?beta=true`.
    expect(sent[0]?.url).toMatch(
      new RegExp(
        `^${HOST.replaceAll('.', '\\.')}/anthropic/v1/messages(\\?|$)`,
      ),
    )
    expect(sent[0]?.headers.get('authorization')).toBe('Bearer nt-test')
    expect(sent[0]?.headers.get('x-api-key')).toBeNull()
  })

  it('sends a Responses-only model to the Responses route', async () => {
    const { fetch, sent } = captureFetch()
    const adapter = createNeonText('gpt-5-3-codex', 'nt-test', {
      baseURL: HOST,
      fetch,
    })
    expect(adapter).toBeInstanceOf(NeonResponsesTextAdapter)

    await drain(adapter, 'gpt-5-3-codex')

    expect(sent[0]?.url).toBe(`${HOST}/openai/v1/responses`)
    expect(sent[0]?.headers.get('authorization')).toBe('Bearer nt-test')
  })

  it('sends a GPT model to Chat Completions unless api is responses', async () => {
    const chat = captureFetch()
    const chatAdapter = createNeonText('gpt-5-4', 'nt-test', {
      baseURL: HOST,
      fetch: chat.fetch,
    })
    expect(chatAdapter).toBeInstanceOf(NeonTextAdapter)
    await drain(chatAdapter, 'gpt-5-4')
    expect(chat.sent[0]?.url).toBe(`${HOST}/v1/chat/completions`)

    const responses = captureFetch()
    const responsesAdapter = createNeonText('gpt-5-4', 'nt-test', {
      api: 'responses',
      baseURL: HOST,
      fetch: responses.fetch,
    })
    expect(responsesAdapter).toBeInstanceOf(NeonResponsesTextAdapter)
    await drain(responsesAdapter, 'gpt-5-4')
    expect(responses.sent[0]?.url).toBe(`${HOST}/openai/v1/responses`)
  })

  it('sends every other model to Chat Completions and tolerates a trailing slash', async () => {
    const { fetch, sent } = captureFetch()
    await drain(
      createNeonText('gemini-3-8-flash', 'nt-test', {
        baseURL: `${HOST}/`,
        fetch,
      }),
      'gemini-3-8-flash',
    )
    expect(sent[0]?.url).toBe(`${HOST}/v1/chat/completions`)
  })

  it('reads the token and host from the environment', async () => {
    vi.stubEnv('NEON_AI_GATEWAY_TOKEN', 'nt-env')
    vi.stubEnv('NEON_AI_GATEWAY_BASE_URL', HOST)
    const { fetch, sent } = captureFetch()

    await drain(neonText('gemini-3-8-flash', { fetch }), 'gemini-3-8-flash')

    expect(sent[0]?.url).toBe(`${HOST}/v1/chat/completions`)
    expect(sent[0]?.headers.get('authorization')).toBe('Bearer nt-env')
  })

  it('names the missing variable', () => {
    vi.stubEnv('NEON_AI_GATEWAY_TOKEN', '')
    vi.stubEnv('NEON_AI_GATEWAY_BASE_URL', '')
    expect(() => neonText('gemini-3-8-flash')).toThrow(/NEON_AI_GATEWAY_TOKEN/)
    expect(() => createNeonText('gemini-3-8-flash', 'nt-test')).toThrow(
      /NEON_AI_GATEWAY_BASE_URL/,
    )
  })
})

describe('neon request body', () => {
  it('sends the model reasoning effort on Chat Completions', async () => {
    const { fetch, sent } = captureFetch()
    await drain(
      createNeonText('gemini-3-8-flash', 'nt-test', { baseURL: HOST, fetch }),
      'gemini-3-8-flash',
      { reasoning: { level: 'high', summary: true } },
    )
    expect(sent[0]?.body.reasoning_effort).toBe('high')
  })

  it('sends stream_options except to Gemini models', async () => {
    const gemini = captureFetch()
    await drain(
      createNeonText('gemini-3-8-flash', 'nt-test', {
        baseURL: HOST,
        fetch: gemini.fetch,
      }),
      'gemini-3-8-flash',
    )
    expect(gemini.sent[0]?.body).not.toHaveProperty('stream_options')

    const gpt = captureFetch()
    await drain(
      createNeonText('gpt-5-4', 'nt-test', { baseURL: HOST, fetch: gpt.fetch }),
      'gpt-5-4',
    )
    expect(gpt.sent[0]?.body.stream_options).toEqual({ include_usage: true })
  })

  it('drops temperature and top_p for a model that rejects them', async () => {
    const modelOptions = { temperature: 0.2, top_p: 0.9 }

    const rejects = captureFetch()
    await drain(
      createNeonText('gpt-5-5', 'nt-test', {
        baseURL: HOST,
        fetch: rejects.fetch,
      }),
      'gpt-5-5',
      { modelOptions },
    )
    expect(rejects.sent[0]?.body).not.toHaveProperty('temperature')
    expect(rejects.sent[0]?.body).not.toHaveProperty('top_p')

    const responses = captureFetch()
    await drain(
      createNeonText('gpt-5-5-pro', 'nt-test', {
        baseURL: HOST,
        fetch: responses.fetch,
      }),
      'gpt-5-5-pro',
      { modelOptions },
    )
    expect(responses.sent[0]?.body).not.toHaveProperty('temperature')

    const accepts = captureFetch()
    await drain(
      createNeonText('gpt-5-4', 'nt-test', {
        baseURL: HOST,
        fetch: accepts.fetch,
      }),
      'gpt-5-4',
      { modelOptions },
    )
    expect(accepts.sent[0]?.body.temperature).toBe(0.2)
    expect(accepts.sent[0]?.body.top_p).toBe(0.9)
  })
})
