import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { openaiCompatible } from '../src/compatible'
import { createOpenaiChat } from '../src/adapters/text'
import type { AdapterYieldChunk, FetchWrapper } from '@tanstack/ai'

const logger = resolveDebugOption(false)

interface Sent {
  url: string
  headers: Headers
  body: Record<string, unknown>
}

/** A fetch that records each request and answers with `events` as SSE. */
function recorder(events: Array<unknown>) {
  const sent: Array<Sent> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    sent.push({
      url: request.url,
      headers: request.headers,
      body: await request.json(),
    })
    return new Response(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
      { headers: { 'content-type': 'text/event-stream' } },
    )
  }
  return { sent, fetch }
}

const hi = [{ role: 'user' as const, content: 'Hi' }]

async function drain(stream: AsyncIterable<AdapterYieldChunk>) {
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

const copilotHeaders = {
  'Openai-Intent': 'conversation-edits',
  'X-GitHub-Api-Version': '2026-08-01',
}

/** Sets `x-initiator` from the last message of the body, for each request. */
const initiator: FetchWrapper = (next) => (input, init) => {
  const body: unknown =
    typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
  const items =
    typeof body === 'object' && body !== null
      ? 'messages' in body
        ? body.messages
        : 'input' in body
          ? body.input
          : undefined
      : undefined
  const last: unknown = Array.isArray(items) ? items.at(-1) : undefined
  const user =
    typeof last === 'object' &&
    last !== null &&
    'role' in last &&
    last.role === 'user'
  const headers = new Headers(init?.headers)
  headers.set('x-initiator', user ? 'user' : 'agent')
  return next(input, { ...init, headers })
}

const completionsDone = [
  { id: 'c-1', choices: [{ index: 0, delta: { content: 'Hi' } }] },
  { id: 'c-1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
]

const responsesDone = [
  {
    type: 'response.completed',
    response: { id: 'r-1', model: 'gpt-5.6', status: 'completed', output: [] },
  },
]

describe('GitHub Copilot wire', () => {
  const copilot = (fetch: typeof globalThis.fetch, api?: 'responses') =>
    openaiCompatible({
      name: 'github-copilot',
      baseURL: 'https://api.githubcopilot.com',
      apiKey: 'copilot-token',
      defaultHeaders: copilotHeaders,
      models: ['gpt-5.6'],
      fetch,
      ...(api ? { api } : {}),
    })

  it('sends Chat Completions to the Copilot URL with fixed and per-request headers', async () => {
    const { sent, fetch } = recorder(completionsDone)
    await drain(
      copilot(fetch)('gpt-5.6').chatStream({
        logger,
        model: 'gpt-5.6',
        messages: hi,
        wrapFetch: initiator,
      }),
    )
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe('https://api.githubcopilot.com/chat/completions')
    expect(sent[0]?.headers.get('authorization')).toBe('Bearer copilot-token')
    expect(sent[0]?.headers.get('openai-intent')).toBe('conversation-edits')
    expect(sent[0]?.headers.get('x-github-api-version')).toBe('2026-08-01')
    expect(sent[0]?.headers.get('x-initiator')).toBe('user')
    expect(sent[0]?.body.model).toBe('gpt-5.6')
    expect(sent[0]?.body.stream).toBe(true)
    expect(sent[0]?.body.messages).toStrictEqual([
      { role: 'user', content: 'Hi' },
    ])
  })

  it('sends a stateless Responses request with encrypted reasoning', async () => {
    const { sent, fetch } = recorder(responsesDone)
    await drain(
      copilot(
        fetch,
        'responses',
      )('gpt-5.6').chatStream({
        logger,
        model: 'gpt-5.6',
        messages: hi,
        wrapFetch: initiator,
        modelOptions: {
          store: false,
          include: ['reasoning.encrypted_content'],
        },
      }),
    )
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe('https://api.githubcopilot.com/responses')
    expect(sent[0]?.headers.get('x-github-api-version')).toBe('2026-08-01')
    expect(sent[0]?.headers.get('x-initiator')).toBe('user')
    expect(sent[0]?.body.store).toBe(false)
    expect(sent[0]?.body.include).toStrictEqual(['reasoning.encrypted_content'])
  })

  it('streams the reasoning that Copilot sends as reasoning_text', async () => {
    const { fetch } = recorder([
      {
        id: 'c-1',
        choices: [{ index: 0, delta: { reasoning_text: 'Say hi back.' } }],
      },
      ...completionsDone,
    ])
    const chunks = await drain(
      copilot(fetch)('gpt-5.6').chatStream({
        logger,
        model: 'gpt-5.6',
        messages: hi,
      }),
    )
    const thinking = chunks.flatMap((chunk) =>
      chunk.type === EventType.REASONING_MESSAGE_CONTENT ? [chunk.delta] : [],
    )
    expect(thinking).toStrictEqual(['Say hi back.'])
  })
})

describe('ChatGPT plan wire', () => {
  it('sends the sign-in token to the Responses API with store off', async () => {
    const { sent, fetch } = recorder(responsesDone)
    await drain(
      createOpenaiChat('gpt-5.6', 'chatgpt-access-token', {
        fetch,
      }).chatStream({
        logger,
        model: 'gpt-5.6',
        messages: hi,
        modelOptions: { store: false },
      }),
    )
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe('https://api.openai.com/v1/responses')
    expect(sent[0]?.headers.get('authorization')).toBe(
      'Bearer chatgpt-access-token',
    )
    expect(sent[0]?.body.store).toBe(false)
    expect(sent[0]?.body).not.toHaveProperty('max_output_tokens')
  })
})
