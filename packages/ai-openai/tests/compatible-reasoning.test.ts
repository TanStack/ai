import { describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import { EventType, createModel } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  OpenAICompatibleChatAdapter,
  OpenAICompatibleResponsesAdapter,
} from '../src/compatible/adapter'
import { openaiCompatible, openaiCompatibleText } from '../src/compatible/index'
import type { AdapterYieldChunk, ReasoningRequest } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'

const testLogger = resolveDebugOption(false)

function createAsyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        async next() {
          if (index < chunks.length) {
            return { value: chunks[index++]!, done: false }
          }
          return { value: undefined as T, done: true }
        },
      }
    },
  }
}

function makeAdapter(streamChunks: Array<Record<string, unknown>>) {
  const client = new OpenAI({ apiKey: 'test-api-key' })
  client.chat.completions.create = vi
    .fn()
    .mockResolvedValue(
      createAsyncIterable(streamChunks),
    ) as typeof client.chat.completions.create
  return new OpenAICompatibleChatAdapter(
    client,
    'deepseek-reasoner',
    'deepseek',
  )
}

async function collect(streamChunks: Array<Record<string, unknown>>) {
  const adapter = makeAdapter(streamChunks)
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of adapter.chatStream({
    threadId: 'thread-1',
    logger: testLogger,
    model: 'deepseek-reasoner',
    messages: [{ role: 'user', content: 'What is 2 + 2?' }],
  })) {
    chunks.push(chunk)
  }
  return chunks
}

function reasoningText(chunks: Array<AdapterYieldChunk>) {
  return chunks
    .filter(
      (chunk): chunk is Extract<AdapterYieldChunk, { delta: string }> =>
        chunk.type === EventType.REASONING_MESSAGE_CONTENT,
    )
    .map((chunk) => chunk.delta)
    .join('')
}

/**
 * Issue #982: an OpenAI-compatible reasoning provider streams its thinking on
 * `delta.reasoning_content` (or `delta.reasoning`), which is outside the OpenAI
 * wire format. The generic adapter had no reasoning hook, so the thinking was
 * dropped and the documented workaround was to monkey-patch the prototype.
 */
describe('OpenAICompatibleChatAdapter reasoning', () => {
  const textChunks = [
    { choices: [{ index: 0, delta: { content: '4' } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ]

  it('streams reasoning delivered as reasoning_content', async () => {
    const chunks = await collect([
      { choices: [{ index: 0, delta: { reasoning_content: 'Two plus two' } }] },
      { choices: [{ index: 0, delta: { reasoning_content: ' is four.' } }] },
      ...textChunks,
    ])

    expect(
      chunks.some((chunk) => chunk.type === EventType.REASONING_START),
    ).toBe(true)
    expect(reasoningText(chunks)).toBe('Two plus two is four.')
  })

  it('streams reasoning delivered as reasoning', async () => {
    const chunks = await collect([
      { choices: [{ index: 0, delta: { reasoning: 'Thinking...' } }] },
      ...textChunks,
    ])

    expect(reasoningText(chunks)).toBe('Thinking...')
  })

  it('prefers reasoning_content when a provider sends both', async () => {
    const chunks = await collect([
      {
        choices: [
          {
            index: 0,
            delta: { reasoning_content: 'canonical', reasoning: 'duplicate' },
          },
        ],
      },
      ...textChunks,
    ])

    expect(reasoningText(chunks)).toBe('canonical')
  })

  it('emits no reasoning events for a provider that sends neither field', async () => {
    const chunks = await collect(textChunks)

    expect(
      chunks.some(
        (chunk) =>
          chunk.type === EventType.REASONING_START ||
          chunk.type === EventType.REASONING_MESSAGE_CONTENT,
      ),
    ).toBe(false)
    expect(
      chunks.some((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT),
    ).toBe(true)
  })

  it('skips a usage chunk that has no choices field', async () => {
    // Some gateways omit `choices` on the usage trailer.
    const chunks = await collect([
      ...textChunks,
      { usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } },
    ])

    expect(chunks.find((c) => c.type === EventType.RUN_ERROR)).toBeUndefined()
    expect(chunks.find((c) => c.type === EventType.RUN_FINISHED)).toMatchObject(
      {
        usage: { totalTokens: 4 },
      },
    )
  })
})

/**
 * `chat({ reasoning })` on the compatible adapters: the `reasoning`
 * constructor option gives the model's levels, and the base sends the level's
 * value as `reasoning_effort` (Chat Completions) or `reasoning.effort`
 * (Responses).
 */
describe('OpenAI-compatible adapters send chat({ reasoning })', () => {
  const REASONING = {
    levels: { low: 'low', high: 'high' },
    budget: false,
  } as const
  type Levels = ModelReasoningCapability<typeof REASONING>

  async function sentRequest(
    api: 'chat' | 'responses',
    reasoning: ReasoningRequest | undefined,
    withLevels = true,
  ) {
    const client = new OpenAI({ apiKey: 'test-api-key' })
    const create = vi.fn().mockResolvedValue(createAsyncIterable([]))
    if (api === 'chat') {
      client.chat.completions.create =
        create as typeof client.chat.completions.create
    } else {
      client.responses.create = create as typeof client.responses.create
    }
    const adapter = !withLevels
      ? new OpenAICompatibleChatAdapter(client, 'model', 'provider')
      : api === 'chat'
        ? new OpenAICompatibleChatAdapter<
            'model',
            Record<string, unknown>,
            readonly ['text'],
            readonly [],
            Levels
          >(client, 'model', 'provider', { reasoning: REASONING })
        : new OpenAICompatibleResponsesAdapter<
            'model',
            Record<string, unknown>,
            readonly ['text'],
            readonly [],
            Levels
          >(client, 'model', 'provider', { reasoning: REASONING })
    for await (const _ of adapter.chatStream({
      threadId: 'thread-1',
      logger: testLogger,
      model: 'model',
      messages: [{ role: 'user', content: 'Hi' }],
      reasoning,
    })) {
      // drain
    }
    return create.mock.calls[0]![0] as Record<string, unknown>
  }

  it('sends the level as reasoning_effort on Chat Completions', async () => {
    const request = await sentRequest('chat', { level: 'high', summary: true })
    expect(request.reasoning_effort).toBe('high')
  })

  it('moves a level the model does not have to the nearest one', async () => {
    const request = await sentRequest('chat', {
      level: 'medium',
      summary: true,
    })
    expect(request.reasoning_effort).toBe('high')
  })

  it('sends reasoning.effort and a summary on Responses', async () => {
    const request = await sentRequest('responses', {
      level: 'low',
      summary: true,
    })
    expect(request.reasoning).toEqual({ effort: 'low', summary: 'auto' })
  })

  it('sends nothing without the reasoning option', async () => {
    const request = await sentRequest(
      'chat',
      { level: 'high', summary: true },
      false,
    )
    expect(request).not.toHaveProperty('reasoning_effort')
  })
})

describe('the OpenAI-compatible factories send the levels of the model', () => {
  const REASONING = {
    levels: { low: 'low', high: 'high' },
    budget: false,
  } as const

  /** A fetch that keeps the request body, then fails the request. */
  function capture() {
    const bodies: Array<Record<string, unknown>> = []
    const fetch: typeof globalThis.fetch = (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Promise.reject(new Error('request captured'))
    }
    return {
      bodies,
      fetch,
      baseURL: 'https://x/v1',
      apiKey: 'k',
      maxRetries: 0,
    }
  }

  async function send(adapter: {
    chatStream: OpenAICompatibleChatAdapter<string>['chatStream']
  }) {
    try {
      for await (const _ of adapter.chatStream({
        threadId: 'thread-1',
        logger: testLogger,
        model: 'm',
        messages: [{ role: 'user', content: 'Hi' }],
        reasoning: { level: 'high', summary: true },
      })) {
        // drain
      }
    } catch {
      // The captured request fails on purpose.
    }
  }

  it('openaiCompatible sends the levels of a createModel def', async () => {
    const { bodies, ...config } = capture()
    const provider = openaiCompatible({
      ...config,
      models: [
        'plain',
        createModel('reasoner', { input: ['text'], reasoning: REASONING }),
      ] as const,
    })

    await send(provider('reasoner'))
    await send(provider('plain'))

    expect(bodies[0]?.reasoning_effort).toBe('high')
    expect(bodies[1]).not.toHaveProperty('reasoning_effort')
  })

  it('openaiCompatibleText sends the levels of its reasoning config', async () => {
    const { bodies, ...config } = capture()

    await send(
      openaiCompatibleText('reasoner', { ...config, reasoning: REASONING }),
    )

    expect(bodies[0]?.reasoning_effort).toBe('high')
  })
})
