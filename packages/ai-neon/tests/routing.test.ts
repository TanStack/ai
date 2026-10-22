import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { AnthropicTextAdapter } from '@tanstack/ai-anthropic'
import {
  buildNeonText,
  createNeonText,
  neonText,
} from '../src/adapters/factory'
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
  const events: Array<unknown> = []
  for await (const event of adapter.chatStream({
    logger,
    model,
    threadId: 'thread-1',
    messages,
    ...extra,
  })) {
    events.push(event)
  }
  return events
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
  it('reports only the input modalities supported by each route', () => {
    const config = { baseURL: HOST }
    expect(
      createNeonText('gemini-3-8-flash', 'nt-test', config).inputModalities,
    ).toEqual(['text', 'image'])
    expect(
      createNeonText('meta-llama-3-3-70b-instruct', 'nt-test', config)
        .inputModalities,
    ).toEqual(['text'])
    expect(
      createNeonText('gpt-5-4', 'nt-test', { ...config, api: 'responses' })
        .inputModalities,
    ).toContain('document')
    expect(
      createNeonText('claude-opus-5-5', 'nt-test', config).inputModalities,
    ).toContain('document')
  })

  it('rejects a route that cannot serve the model, including untyped callers', () => {
    expect(() =>
      buildNeonText('gpt-5-3-codex', 'nt-test', { baseURL: HOST, api: 'chat' }),
    ).toThrow(/requires the Responses API/)
    expect(() =>
      buildNeonText('gemini-3-8-flash', 'nt-test', {
        baseURL: HOST,
        api: 'responses',
      }),
    ).toThrow(/does not support the Responses API/)
    expect(() =>
      buildNeonText('claude-opus-5-5', 'nt-test', {
        baseURL: HOST,
        api: 'chat',
      }),
    ).toThrow(/uses the Anthropic Messages API/)
  })

  it('drops rejected Claude sampling settings, including through wrapFetch', async () => {
    const { fetch, sent } = captureFetch()
    const modelOptions = { temperature: 0.2, top_p: 0.9 }
    const events = await drain(
      createNeonText('claude-opus-5-5', 'nt-test', { baseURL: HOST, fetch }),
      'claude-opus-5-5',
      {
        modelOptions,
        wrapFetch: (next) => (input, init) => next(input, init),
      },
    )
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'RUN_ERROR' }),
    )
    expect(sent).toHaveLength(1)
    expect(sent[0]?.body).not.toHaveProperty('temperature')
    expect(sent[0]?.body).not.toHaveProperty('top_p')
    expect(modelOptions).toEqual({ temperature: 0.2, top_p: 0.9 })

    const accepts = captureFetch()
    await drain(
      createNeonText('claude-sonnet-4-5', 'nt-test', {
        baseURL: HOST,
        fetch: accepts.fetch,
      }),
      'claude-sonnet-4-5',
      { modelOptions: { temperature: 0.2 } },
    )
    expect(accepts.sent[0]?.body.temperature).toBe(0.2)
  })

  it('drops rejected Claude sampling settings on structured output', async () => {
    const bodies: Array<Record<string, unknown>> = []
    const model = 'claude-opus-5-5'
    const adapter = createNeonText(model, 'nt-test', {
      baseURL: HOST,
      fetch: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)))
        return Response.json({
          id: 'msg-neon',
          type: 'message',
          role: 'assistant',
          model,
          content: [
            {
              type: 'tool_use',
              id: 'tool-neon',
              name: 'structured_output',
              input: { ok: true },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 3, output_tokens: 5 },
        })
      },
    })
    const modelOptions = { max_tokens: 73, temperature: 0.2, top_p: 0.9 }
    const result = await adapter.structuredOutput({
      outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      chatOptions: {
        model,
        threadId: 'thread-1',
        messages,
        logger,
        modelOptions,
      },
    })
    expect(result.data).toEqual({ ok: true })
    expect(bodies).toHaveLength(1)
    expect(bodies[0]?.max_tokens).toBe(73)
    expect(bodies[0]).not.toHaveProperty('temperature')
    expect(bodies[0]).not.toHaveProperty('top_p')
    expect(modelOptions).toEqual({
      max_tokens: 73,
      temperature: 0.2,
      top_p: 0.9,
    })
  })

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
