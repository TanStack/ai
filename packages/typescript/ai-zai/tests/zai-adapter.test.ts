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

function createAdapter(overrides?: {
  apiKey?: string
  baseURL?: string
  coding?: boolean
}) {
  return new ZAITextAdapter(
    {
      apiKey: overrides?.apiKey ?? 'test_api_key',
      baseURL: overrides?.baseURL,
      coding: overrides?.coding,
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

function createNoopLogger() {
  return {
    request: vi.fn(),
    provider: vi.fn(),
    output: vi.fn(),
    middleware: vi.fn(),
    tools: vi.fn(),
    agentLoop: vi.fn(),
    config: vi.fn(),
    errors: vi.fn(),
  }
}

function baseOptions(overrides?: Partial<TextOptions>): TextOptions {
  return {
    model: 'glm-4.7',
    messages: [{ role: 'user', content: 'hi' }],
    logger: createNoopLogger() as any,
    ...overrides,
  }
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
      expect(openAIState.lastOptions.baseURL).toBe(
        'https://api.z.ai/api/paas/v4',
      )
    })

    it('supports custom baseURL', () => {
      createAdapter({ baseURL: 'https://example.invalid/zai' })
      expect(openAIState.lastOptions.baseURL).toBe(
        'https://example.invalid/zai',
      )
    })

    it('sets default headers (Accept-Language)', () => {
      createAdapter()
      expect(openAIState.lastOptions.defaultHeaders).toBeTruthy()
      expect(openAIState.lastOptions.defaultHeaders['Accept-Language']).toBe(
        'en-US,en',
      )
    })

    it('validates API key (rejects Bearer prefix)', () => {
      expect(() => createAdapter({ apiKey: 'Bearer abc' })).toThrowError(
        /raw token/i,
      )
    })

    it('validates API key (rejects whitespace)', () => {
      expect(() => createAdapter({ apiKey: 'abc def' })).toThrowError(
        /whitespace/i,
      )
    })

    it('uses coding endpoint when coding: true', () => {
      createAdapter({ coding: true })
      expect(openAIState.lastOptions.baseURL).toBe(
        'https://api.z.ai/api/coding/paas/v4',
      )
    })

    it('explicit baseURL overrides coding flag', () => {
      createAdapter({ coding: true, baseURL: 'https://example.invalid/zai' })
      expect(openAIState.lastOptions.baseURL).toBe(
        'https://example.invalid/zai',
      )
    })
  })

  describe('Options Mapping', () => {
    it('maps maxTokens → max_tokens, temperature, topP', () => {
      const adapter = createAdapter()
      const map = (adapter as any).mapTextOptionsToZAI.bind(adapter) as (
        opts: TextOptions,
      ) => any

      const options = baseOptions({
        maxTokens: 123,
        temperature: 0.7,
        topP: 0.9,
      })

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

      const mapped = map(baseOptions({ tools }))

      expect(mapped.tools).toBeTruthy()
      expect(mapped.tools).toHaveLength(1)
      expect(mapped.tools[0].type).toBe('function')
      expect(mapped.tools[0].function.name).toBe('get_weather')
      expect(mapped.tools[0].function.parameters.additionalProperties).toBe(
        false,
      )
    })

    it('maps stop sequences from modelOptions.stopSequences to stop', () => {
      const adapter = createAdapter()
      const map = (adapter as any).mapTextOptionsToZAI.bind(adapter) as (
        opts: TextOptions,
      ) => any

      const mapped = map(
        baseOptions({
          modelOptions: { stopSequences: ['END'] } as any,
        }),
      )

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

      const out = convert([{ role: 'user', content: 'hi' }], {
        systemPrompts: ['You are helpful', 'Be concise'],
      })

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

    it('converts multi-turn conversation (user -> assistant -> user)', () => {
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
              {
                type: 'image',
                source: { type: 'url', value: 'https://x/y.png' },
              },
              { type: 'text', content: 'hello' },
            ] as any,
          },
        ],
        {},
      )

      expect(out).toEqual([{ role: 'user', content: 'hello' }])
    })

    it('preserves image parts for multimodal models (glm-4.6v)', () => {
      const adapter = new ZAITextAdapter({ apiKey: 'test' }, 'glm-4.6v')
      const convert = (adapter as any).convertMessagesToInput.bind(adapter) as (
        messages: Array<ModelMessage>,
        opts: Pick<TextOptions, 'systemPrompts'>,
      ) => Array<any>

      const out = convert(
        [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'url', value: 'https://x/y.png' },
              },
              { type: 'text', content: 'hello' },
            ] as any,
          },
        ],
        {},
      )

      expect(out).toEqual([
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://x/y.png' } },
            { type: 'text', text: 'hello' },
          ],
        },
      ])
    })
  })

  describe('Error Handling', () => {
    it('throws on network/client error (errors are logged and re-thrown)', async () => {
      const adapter = createAdapter()
      openAIState.create.mockRejectedValueOnce(new Error('network down'))

      await expect(collect(adapter.chatStream(baseOptions()))).rejects.toThrow(
        /network down/i,
      )
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
        adapter.chatStream(baseOptions({ messages: [] })),
      )

      expect(openAIState.create).toHaveBeenCalled()
      const callArgs = openAIState.create.mock.calls[0]
      expect(callArgs[0].messages).toEqual([])
      expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    })

    it('does not throw on malformed stream chunks', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([{ id: 'resp_1', model: 'glm-4.7' }]),
      )

      const chunks = await collect(adapter.chatStream(baseOptions()))

      // Emits RUN_STARTED on first chunk but no text or finish events
      const types = chunks.map((c) => c.type)
      expect(types).toContain('RUN_STARTED')
      expect(types).not.toContain('TEXT_MESSAGE_START')
      expect(types).not.toContain('RUN_FINISHED')
    })
  })

  describe('Streaming Behavior (AG-UI Protocol)', () => {
    it('emits RUN_STARTED, TEXT_MESSAGE_START/CONTENT/END, RUN_FINISHED for text', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([
          {
            id: 'resp_1',
            model: 'glm-4.7',
            choices: [{ delta: { content: 'He' } }],
          },
          {
            id: 'resp_1',
            model: 'glm-4.7',
            choices: [{ delta: { content: 'llo' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          },
        ]),
      )

      const chunks = await collect(adapter.chatStream(baseOptions()))
      const types = chunks.map((c) => c.type)

      // AG-UI lifecycle: RUN_STARTED -> TEXT_MESSAGE_START -> TEXT_MESSAGE_CONTENT (x2) -> TEXT_MESSAGE_END -> RUN_FINISHED
      expect(types).toContain('RUN_STARTED')
      expect(types).toContain('TEXT_MESSAGE_START')
      expect(types.filter((t) => t === 'TEXT_MESSAGE_CONTENT')).toHaveLength(2)
      expect(types).toContain('TEXT_MESSAGE_END')
      expect(types).toContain('RUN_FINISHED')

      // Verify text content accumulation
      const contentChunks = chunks.filter(
        (c): c is Extract<StreamChunk, { type: 'TEXT_MESSAGE_CONTENT' }> =>
          c.type === 'TEXT_MESSAGE_CONTENT',
      )
      expect((contentChunks[0] as any).delta).toBe('He')
      expect((contentChunks[0] as any).content).toBe('He')
      expect((contentChunks[1] as any).delta).toBe('llo')
      expect((contentChunks[1] as any).content).toBe('Hello')

      // Verify RUN_FINISHED carries usage and finishReason
      const done = chunks.find((c) => c.type === 'RUN_FINISHED') as any
      expect(done).toBeTruthy()
      expect(done.finishReason).toBe('stop')
      expect(done.usage).toEqual({
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
      })
    })

    it('emits TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END for tool calls', async () => {
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
                      function: { name: 'get_weather', arguments: '{"q":' },
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
                  tool_calls: [{ index: 0, function: { arguments: '"SF"}' } }],
                },
                finish_reason: 'tool_calls',
              },
            ],
          },
        ]),
      )

      const chunks = await collect(
        adapter.chatStream(
          baseOptions({
            tools: [
              {
                name: 'get_weather',
                description: 'Get weather',
                inputSchema: { type: 'object', properties: {}, required: [] },
              },
            ],
          }),
        ),
      )

      const types = chunks.map((c) => c.type)

      // AG-UI tool call lifecycle
      expect(types).toContain('TOOL_CALL_START')
      expect(types).toContain('TOOL_CALL_ARGS')
      expect(types).toContain('TOOL_CALL_END')
      expect(types).toContain('RUN_FINISHED')

      const toolStart = chunks.find((c) => c.type === 'TOOL_CALL_START') as any
      expect(toolStart.toolCallId).toBe('call_1')
      expect(toolStart.toolCallName).toBe('get_weather')

      const toolEnd = chunks.find((c) => c.type === 'TOOL_CALL_END') as any
      expect(toolEnd.toolCallId).toBe('call_1')
      expect(toolEnd.toolCallName).toBe('get_weather')
      expect(toolEnd.input).toEqual({ q: 'SF' })

      const done = chunks.find((c) => c.type === 'RUN_FINISHED') as any
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
        adapter.chatStream(
          baseOptions({
            request: { headers: { 'X-Test': '1' } } as any,
          }),
        ),
      )

      const callArgs = openAIState.create.mock.calls[0]
      expect(callArgs[1].headers).toEqual({ 'X-Test': '1' })
    })

    it('calls logger.request before the SDK call', async () => {
      const logger = createNoopLogger()
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

      await collect(adapter.chatStream(baseOptions({ logger: logger as any })))

      expect(logger.request).toHaveBeenCalled()
      expect(logger.request.mock.calls[0][0]).toContain('provider=zai')
    })
  })
})
