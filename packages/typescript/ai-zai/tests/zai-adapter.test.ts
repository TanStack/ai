import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelMessage, StreamChunk, TextOptions, Tool } from '@tanstack/ai'
import { ZAITextAdapter } from '../src/adapters/text'

const openAIState = {
  lastOptions: undefined as any,
  create: vi.fn(),
}

vi.mock('openai', () => {
  class OpenAI {
    chat: any
    constructor(opts: any) {
      openAIState.lastOptions = opts
      this.chat = {
        completions: {
          create: openAIState.create,
        },
      }
    }
  }

  return { default: OpenAI }
})

function createAdapter(overrides?: { apiKey?: string; baseURL?: string }) {
  return new ZAITextAdapter(
    {
      apiKey: overrides?.apiKey ?? 'test_api_key',
      baseURL: overrides?.baseURL,
    },
    'glm-4.7' as any,
  )
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<Array<T>> {
  const result: Array<T> = []
  for await (const item of iterable) result.push(item)
  return result
}

async function* streamOf(chunks: Array<any>) {
  for (const c of chunks) yield c
}

describe('ZAITextAdapter', () => {
  beforeEach(() => {
    openAIState.lastOptions = undefined
    openAIState.create.mockReset()
  })

  describe('Constructor & Initialization', () => {
    it('initializes OpenAI SDK with default Z.AI baseURL', () => {
      createAdapter()
      expect(openAIState.lastOptions).toBeTruthy()
      expect(openAIState.lastOptions.baseURL).toBe('https://api.z.ai/api/paas/v4')
    })

    it('supports custom baseURL', () => {
      createAdapter({ baseURL: 'https://example.invalid/zai' })
      expect(openAIState.lastOptions.baseURL).toBe('https://example.invalid/zai')
    })

    it('sets default headers (Accept-Language)', () => {
      createAdapter()
      expect(openAIState.lastOptions.defaultHeaders).toBeTruthy()
      expect(openAIState.lastOptions.defaultHeaders['Accept-Language']).toBe('en-US,en')
    })

    it('validates API key (rejects Bearer prefix)', () => {
      expect(() => createAdapter({ apiKey: 'Bearer abc' })).toThrowError(/raw token/i)
    })

    it('validates API key (rejects whitespace)', () => {
      expect(() => createAdapter({ apiKey: 'abc def' })).toThrowError(/whitespace/i)
    })
  })

  describe('Options Mapping', () => {
    it('maps maxTokens → max_tokens, temperature, topP', () => {
      const adapter = createAdapter()
      const map = (adapter as any).mapTextOptionsToZAI.bind(adapter) as (
        opts: TextOptions,
      ) => any

      const options: TextOptions = {
        model: 'glm-4.7',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 123,
        temperature: 0.7,
        topP: 0.9,
      }

      const mapped = map(options)
      expect(mapped.model).toBe('glm-4.7')
      expect(mapped.max_tokens).toBe(123)
      expect(mapped.temperature).toBe(0.7)
      expect(mapped.top_p).toBe(0.9)
      expect(mapped.stream).toBe(true)
      expect(mapped.stream_options).toEqual({ include_usage: true })
    })

    it('converts tools to OpenAI-compatible function tool format', () => {
      const adapter = createAdapter()
      const map = (adapter as any).mapTextOptionsToZAI.bind(adapter) as (
        opts: TextOptions,
      ) => any

      const tools: Array<Tool> = [
        {
          name: 'get_weather',
          description: 'Get weather',
          inputSchema: {
            type: 'object',
            properties: { location: { type: 'string' } },
            required: ['location'],
          },
        },
      ]

      const mapped = map({
        model: 'glm-4.7',
        messages: [{ role: 'user', content: 'hi' }],
        tools,
      } satisfies TextOptions)

      expect(mapped.tools).toBeTruthy()
      expect(mapped.tools).toHaveLength(1)
      expect(mapped.tools[0].type).toBe('function')
      expect(mapped.tools[0].function.name).toBe('get_weather')
      expect(mapped.tools[0].function.parameters.additionalProperties).toBe(false)
    })

    it('maps stop sequences from modelOptions.stopSequences to stop', () => {
      const adapter = createAdapter()
      const map = (adapter as any).mapTextOptionsToZAI.bind(adapter) as (
        opts: TextOptions,
      ) => any

      const mapped = map({
        model: 'glm-4.7',
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: { stopSequences: ['END'] } as any,
      } satisfies TextOptions)

      expect(mapped.stop).toEqual(['END'])
    })
  })

  describe('Message Conversion', () => {
    it('converts simple user text message', () => {
      const adapter = createAdapter()
      const convert = (adapter as any).convertMessagesToInput.bind(adapter) as (
        messages: Array<ModelMessage>,
        opts: Pick<TextOptions, 'systemPrompts'>,
      ) => Array<any>

      const out = convert([{ role: 'user', content: 'hi' }], {})
      expect(out).toEqual([{ role: 'user', content: 'hi' }])
    })

    it('handles system prompts as leading system message', () => {
      const adapter = createAdapter()
      const convert = (adapter as any).convertMessagesToInput.bind(adapter) as (
        messages: Array<ModelMessage>,
        opts: Pick<TextOptions, 'systemPrompts'>,
      ) => Array<any>

      const out = convert(
        [{ role: 'user', content: 'hi' }],
        { systemPrompts: ['You are helpful', 'Be concise'] },
      )

      expect(out[0]).toEqual({
        role: 'system',
        content: 'You are helpful\nBe concise',
      })
      expect(out[1]).toEqual({ role: 'user', content: 'hi' })
    })

    it('converts tool result messages', () => {
      const adapter = createAdapter()
      const convert = (adapter as any).convertMessagesToInput.bind(adapter) as (
        messages: Array<ModelMessage>,
        opts: Pick<TextOptions, 'systemPrompts'>,
      ) => Array<any>

      const out = convert(
        [
          {
            role: 'tool',
            toolCallId: 'call_1',
            content: '{"ok":true}',
          },
        ],
        {},
      )

      expect(out).toEqual([
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: '{"ok":true}',
        },
      ])
    })

    it('converts multi-turn conversation (user → assistant → user)', () => {
      const adapter = createAdapter()
      const convert = (adapter as any).convertMessagesToInput.bind(adapter) as (
        messages: Array<ModelMessage>,
        opts: Pick<TextOptions, 'systemPrompts'>,
      ) => Array<any>

      const out = convert(
        [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
          { role: 'user', content: 'how are you' },
        ],
        {},
      )

      expect(out).toEqual([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'how are you' },
      ])
    })

    it('ignores image parts and preserves text parts', () => {
      const adapter = createAdapter()
      const convert = (adapter as any).convertMessagesToInput.bind(adapter) as (
        messages: Array<ModelMessage>,
        opts: Pick<TextOptions, 'systemPrompts'>,
      ) => Array<any>

      const out = convert(
        [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', value: 'https://x/y.png' } },
              { type: 'text', content: 'hello' },
            ] as any,
          },
        ],
        {},
      )

      expect(out).toEqual([{ role: 'user', content: 'hello' }])
    })
  })

  describe('Error Handling', () => {
    it('yields error chunk on network/client error (does not throw)', async () => {
      const adapter = createAdapter()
      openAIState.create.mockRejectedValueOnce(new Error('network down'))

      const chunks = await collect(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [{ role: 'user', content: 'hi' }],
        } satisfies TextOptions) as AsyncIterable<StreamChunk>,
      )

      expect(chunks).toHaveLength(1)
      expect(chunks[0]?.type).toBe('error')
      expect((chunks[0] as any).model).toBe('glm-4.7')
      expect((chunks[0] as any).error.message).toMatch(/network down/i)
    })

    it('handles empty messages array without crashing', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([
          {
            id: 'resp_1',
            model: 'glm-4.7',
            choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          },
        ]),
      )

      const chunks = await collect(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [],
        } satisfies TextOptions),
      )

      expect(openAIState.create).toHaveBeenCalled()
      const callArgs = openAIState.create.mock.calls[0]
      expect(callArgs[0].messages).toEqual([])
      expect(chunks.some((c) => c.type === 'done')).toBe(true)
    })

    it('does not throw on malformed stream chunks', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(streamOf([{ id: 'resp_1', model: 'glm-4.7' }]))

      const chunks = await collect(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [{ role: 'user', content: 'hi' }],
        } satisfies TextOptions),
      )

      expect(chunks).toEqual([])
    })
  })

  describe('Streaming Behavior', () => {
    it('accumulates content deltas and emits done', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([
          { id: 'resp_1', model: 'glm-4.7', choices: [{ delta: { content: 'He' } }] },
          {
            id: 'resp_1',
            model: 'glm-4.7',
            choices: [{ delta: { content: 'llo' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          },
        ]),
      )

      const chunks = await collect(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [{ role: 'user', content: 'hi' }],
        } satisfies TextOptions),
      )

      expect(chunks[0]?.type).toBe('content')
      expect((chunks[0] as any).delta).toBe('He')
      expect((chunks[0] as any).content).toBe('He')

      expect(chunks[1]?.type).toBe('content')
      expect((chunks[1] as any).delta).toBe('llo')
      expect((chunks[1] as any).content).toBe('Hello')

      const done = chunks.find((c) => c.type === 'done') as any
      expect(done).toBeTruthy()
      expect(done.finishReason).toBe('stop')
      expect(done.usage).toEqual({ promptTokens: 1, completionTokens: 2, totalTokens: 3 })
    })

    it('accumulates tool call arguments and emits tool_call + done(tool_calls)', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([
          {
            id: 'resp_1',
            model: 'glm-4.7',
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      function: { name: 'get_weather', arguments: '{\"q\":' },
                    },
                  ],
                },
              },
            ],
          },
          {
            id: 'resp_1',
            model: 'glm-4.7',
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, function: { arguments: '\"SF\"}' } }],
                },
                finish_reason: 'tool_calls',
              },
            ],
          },
        ]),
      )

      const chunks = await collect(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [{ role: 'user', content: 'hi' }],
          tools: [
            {
              name: 'get_weather',
              description: 'Get weather',
              inputSchema: { type: 'object', properties: {}, required: [] },
            },
          ],
        } satisfies TextOptions),
      )

      const toolCall = chunks.find((c) => c.type === 'tool_call') as any
      expect(toolCall).toBeTruthy()
      expect(toolCall.index).toBe(0)
      expect(toolCall.toolCall.id).toBe('call_1')
      expect(toolCall.toolCall.function.name).toBe('get_weather')
      expect(toolCall.toolCall.function.arguments).toBe('{\"q\":\"SF\"}')

      const done = chunks.find((c) => c.type === 'done') as any
      expect(done).toBeTruthy()
      expect(done.finishReason).toBe('tool_calls')
    })

    it('passes through request headers when provided', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([
          {
            id: 'resp_1',
            model: 'glm-4.7',
            choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
          },
        ]),
      )

      await collect(
        adapter.chatStream({
          model: 'glm-4.7',
          messages: [{ role: 'user', content: 'hi' }],
          request: { headers: { 'X-Test': '1' } } as any,
        } satisfies TextOptions),
      )

      const callArgs = openAIState.create.mock.calls[0]
      expect(callArgs[1].headers).toEqual({ 'X-Test': '1' })
    })
  })
})

