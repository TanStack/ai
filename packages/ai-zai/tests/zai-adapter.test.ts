import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StreamChunk, TextOptions, Tool } from '@tanstack/ai'
import { ZAITextAdapter } from '../src/adapters/text'
import { zaiWebSearchTool } from '../src/tools/web-search-tool'
import type { ZAIChatModel } from '../src/model-meta'

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

function createAdapter(
  overrides?: {
    apiKey?: string
    baseURL?: string
    coding?: boolean
  },
  model: ZAIChatModel = 'glm-5.2',
) {
  return new ZAITextAdapter(
    {
      apiKey: overrides?.apiKey ?? 'test_api_key',
      baseURL: overrides?.baseURL,
      coding: overrides?.coding,
    },
    model,
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
    warn: vi.fn(),
  }
}

function baseOptions(overrides?: Partial<TextOptions>): TextOptions {
  return {
    model: 'glm-5.2',
    messages: [{ role: 'user', content: 'hi' }],
    threadId: 'test-thread',
    logger: createNoopLogger() as any,
    ...overrides,
  }
}

function mapOptions(
  overrides?: Partial<TextOptions>,
  model: ZAIChatModel = 'glm-5.2',
) {
  const adapter = createAdapter(undefined, model) as any
  return adapter.mapOptionsToRequest({ ...baseOptions(), ...overrides } as any)
}

const weatherTool: Tool = {
  name: 'get_weather',
  description: 'Get weather',
  inputSchema: {
    type: 'object',
    properties: { location: { type: 'string' } },
    required: ['location'],
  },
}

describe('ZAITextAdapter', () => {
  beforeEach(() => {
    openAIState.lastOptions = undefined
    openAIState.create.mockReset()
  })

  describe('Constructor & Initialization', () => {
    it('initializes the OpenAI SDK with the default Z.AI baseURL', () => {
      createAdapter()
      expect(openAIState.lastOptions).toBeTruthy()
      expect(openAIState.lastOptions.baseURL).toBe(
        'https://api.z.ai/api/paas/v4',
      )
    })

    it('supports a custom baseURL', () => {
      createAdapter({ baseURL: 'https://example.invalid/zai' })
      expect(openAIState.lastOptions.baseURL).toBe(
        'https://example.invalid/zai',
      )
    })

    it('sets default headers (Accept-Language)', () => {
      createAdapter()
      expect(openAIState.lastOptions.defaultHeaders['Accept-Language']).toBe(
        'en-US,en',
      )
    })

    it('rejects a Bearer-prefixed API key', () => {
      expect(() => createAdapter({ apiKey: 'Bearer abc' })).toThrowError(
        /raw token/i,
      )
    })

    it('rejects an API key with whitespace', () => {
      expect(() => createAdapter({ apiKey: 'abc def' })).toThrowError(
        /whitespace/i,
      )
    })

    it('uses the coding endpoint when coding: true', () => {
      createAdapter({ coding: true })
      expect(openAIState.lastOptions.baseURL).toBe(
        'https://api.z.ai/api/coding/paas/v4',
      )
    })

    it('lets an explicit baseURL override the coding flag', () => {
      createAdapter({ coding: true, baseURL: 'https://example.invalid/zai' })
      expect(openAIState.lastOptions.baseURL).toBe(
        'https://example.invalid/zai',
      )
    })
  })

  describe('Options Mapping', () => {
    it('passes sampling modelOptions through with Z.AI wire names', () => {
      const mapped = mapOptions({
        modelOptions: { max_tokens: 123, temperature: 0.7, top_p: 0.9 },
      })

      expect(mapped).toMatchObject({
        model: 'glm-5.2',
        max_tokens: 123,
        temperature: 0.7,
        top_p: 0.9,
        stream: true,
      })
      expect(mapped.messages).toEqual([{ role: 'user', content: 'hi' }])
    })

    it('converts function tools and pins tool_choice to auto', () => {
      const mapped = mapOptions({ tools: [weatherTool] })

      expect(mapped.tools).toHaveLength(1)
      expect(mapped.tools[0]).toMatchObject({
        type: 'function',
        function: { name: 'get_weather', strict: true },
      })
      expect(mapped.tools[0].function.parameters.additionalProperties).toBe(
        false,
      )
      expect(mapped.tool_choice).toBe('auto')
    })

    it('converts the branded web_search tool to its native wire shape', () => {
      const mapped = mapOptions({
        tools: [zaiWebSearchTool({ search_query: 'tanstack' })],
      })

      expect(mapped.tools).toEqual([
        {
          type: 'web_search',
          web_search: { enable: true, search_query: 'tanstack' },
        },
      ])
      expect(mapped.tool_choice).toBe('auto')
    })

    it('forces tool_choice auto even when the caller asks for required', () => {
      const mapped = mapOptions({
        tools: [weatherTool],
        toolChoice: 'required',
      })

      expect(mapped.tool_choice).toBe('auto')
    })

    it('forces tool_choice auto over a modelOptions.tool_choice', () => {
      const mapped = mapOptions({
        tools: [weatherTool],
        modelOptions: { tool_choice: 'none' } as any,
      })

      expect(mapped.tool_choice).toBe('auto')
    })

    it('sends no tool_choice when the request has no tools', () => {
      const mapped = mapOptions()
      expect(mapped).not.toHaveProperty('tool_choice')
    })

    it('drops the tools when the caller asks for toolChoice none', () => {
      const mapped = mapOptions({
        tools: [weatherTool],
        toolChoice: 'none',
      })

      expect(mapped).not.toHaveProperty('tools')
      expect(mapped).not.toHaveProperty('tool_choice')
    })

    it('warns once when a forcing choice falls back to auto', () => {
      const warn = vi.fn()
      const adapter = createAdapter() as any
      const options = {
        ...baseOptions(),
        tools: [weatherTool],
        toolChoice: 'required',
        logger: { ...createNoopLogger(), warn },
      }

      adapter.mapOptionsToRequest(options)
      adapter.mapOptionsToRequest(options)

      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('maps a reasoning level to reasoning_effort for glm-5.2', () => {
      const mapped = mapOptions({
        reasoning: { level: 'max', summary: false },
      })
      expect(mapped.reasoning_effort).toBe('max')
    })

    it('maps every reasoning level for glm-5.2', () => {
      const mapped = mapOptions({
        reasoning: { level: 'low', summary: true },
      })
      expect(mapped.reasoning_effort).toBe('low')

      const off = mapOptions({ reasoning: { level: 'off', summary: false } })
      expect(off.reasoning_effort).toBe('none')
    })

    it('passes low effort through for glm-5.3', () => {
      const mapped = mapOptions({
        model: 'glm-5.3',
        reasoning: { level: 'low', summary: true },
      })
      expect(mapped.reasoning_effort).toBe('low')
    })

    it('passes low effort through for glm-5.3-flash', () => {
      const mapped = mapOptions({
        model: 'glm-5.3-flash',
        reasoning: { level: 'low', summary: true },
      })
      expect(mapped.reasoning_effort).toBe('low')
    })

    it('clamps a level below the model minimum up to low', () => {
      const mapped = mapOptions({
        model: 'glm-5.3',
        reasoning: { level: 'off', summary: false },
      })
      expect(mapped.reasoning_effort).toBe('low')
    })

    it('sends no reasoning_effort for a model that does not reason', () => {
      const mapped = mapOptions({
        model: 'glm-4.7',
        reasoning: { level: 'high', summary: true },
      })
      expect(mapped).not.toHaveProperty('reasoning_effort')
    })
  })

  describe('Structured Output', () => {
    it('sends json_object plus the schema as a system prompt, not json_schema', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce({
        id: 'resp_1',
        model: 'glm-5.2',
        choices: [
          {
            message: { content: '{"name":"Ada"}' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      })

      const result = await adapter.structuredOutput({
        chatOptions: baseOptions({
          messages: [{ role: 'user', content: 'Return a person as json' }],
        }),
        outputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      })

      expect(result.data).toEqual({ name: 'Ada' })

      const params = openAIState.create.mock.calls[0]![0] as any
      expect(params.response_format).toEqual({ type: 'json_object' })
      expect(params.messages[0]).toEqual({
        role: 'system',
        content: expect.stringContaining('"required":["name"]'),
      })
      expect(params.messages[1]).toEqual({
        role: 'user',
        content: 'Return a person as json',
      })
    })

    it('opts out of combined tools+schema mode', () => {
      expect(createAdapter().supportsCombinedToolsAndSchema()).toBe(false)
    })
  })

  describe('Message Conversion', () => {
    it('passes a simple user text message through', () => {
      const mapped = mapOptions({
        messages: [{ role: 'user', content: 'hi' }],
      })
      expect(mapped.messages).toEqual([{ role: 'user', content: 'hi' }])
    })

    it('merges system prompts into a leading system message', () => {
      const mapped = mapOptions({
        systemPrompts: ['You are helpful', 'Be concise'],
      })

      expect(mapped.messages).toEqual([
        { role: 'system', content: 'You are helpful\nBe concise' },
        { role: 'user', content: 'hi' },
      ])
    })

    it('converts tool result messages', () => {
      const mapped = mapOptions({
        messages: [
          {
            role: 'tool',
            toolCallId: 'call_1',
            content: '{"ok":true}',
          },
        ],
      })

      expect(mapped.messages).toEqual([
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: '{"ok":true}',
        },
      ])
    })

    it('keeps multi-turn text history', () => {
      const mapped = mapOptions({
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
          { role: 'user', content: 'how are you' },
        ],
      })

      expect(mapped.messages).toEqual([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'how are you' },
      ])
    })

    it('maps image parts to image_url for a vision model', () => {
      const mapped = mapOptions(
        {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'url', value: 'https://x/y.png' },
                },
                { type: 'text', content: 'hello' },
              ],
            } as any,
          ],
        },
        'glm-4.6v',
      )

      expect(mapped.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://x/y.png', detail: 'auto' },
            },
            { type: 'text', text: 'hello' },
          ],
        },
      ])
    })

    it('maps video parts to video_url', () => {
      const mapped = mapOptions(
        {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'video',
                  source: { type: 'url', value: 'https://x/clip.mp4' },
                },
                { type: 'text', content: 'describe' },
              ],
            } as any,
          ],
        },
        'glm-4.6v',
      )

      expect(mapped.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'video_url',
              video_url: { url: 'https://x/clip.mp4' },
            },
            { type: 'text', text: 'describe' },
          ],
        },
      ])
    })
    it('rejects a base64 video source', () => {
      expect(() =>
        mapOptions(
          {
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'video', source: { type: 'data', value: 'AAAA' } },
                ],
              } as any,
            ],
          },
          'glm-4.6v',
        ),
      ).toThrow('Z.AI video input needs an HTTP(S) URL')
    })
  })

  describe('Streaming Behavior (AG-UI Protocol)', () => {
    it('emits the text lifecycle and picks up the trailing usage-only chunk', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([
          {
            id: 'resp_1',
            model: 'glm-5.2',
            choices: [{ delta: { content: 'He' } }],
          },
          {
            id: 'resp_1',
            model: 'glm-5.2',
            choices: [{ delta: { content: 'llo' }, finish_reason: 'stop' }],
          },
          {
            id: 'resp_1',
            model: 'glm-5.2',
            choices: [],
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          },
        ]),
      )

      const chunks = await collect(adapter.chatStream(baseOptions()))
      const types = chunks.map((c) => c.type)

      expect(types).toContain('RUN_STARTED')
      expect(types).toContain('TEXT_MESSAGE_START')
      expect(types.filter((t) => t === 'TEXT_MESSAGE_CONTENT')).toHaveLength(2)
      expect(types).toContain('TEXT_MESSAGE_END')
      expect(types).toContain('RUN_FINISHED')

      const contentChunks = chunks.filter(
        (c): c is Extract<StreamChunk, { type: 'TEXT_MESSAGE_CONTENT' }> =>
          c.type === 'TEXT_MESSAGE_CONTENT',
      )
      expect(contentChunks[0]!.delta).toBe('He')
      expect(contentChunks[1]!.delta).toBe('llo')

      const done = chunks.find((c) => c.type === 'RUN_FINISHED') as any
      expect(done.finishReason).toBe('stop')
      expect(done.usage).toEqual({
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
      })
    })

    it('streams reasoning_content before the answer text', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([
          {
            id: 'resp_1',
            model: 'glm-5.2',
            choices: [{ delta: { reasoning_content: 'think ' } }],
          },
          {
            id: 'resp_1',
            model: 'glm-5.2',
            choices: [{ delta: { reasoning_content: 'hard' } }],
          },
          {
            id: 'resp_1',
            model: 'glm-5.2',
            choices: [{ delta: { content: 'Answer' }, finish_reason: 'stop' }],
          },
        ]),
      )

      const chunks = await collect(adapter.chatStream(baseOptions()))
      const types: Array<string> = chunks.map((c) => c.type)

      expect(types).toContain('REASONING_START')
      expect(types).toContain('REASONING_MESSAGE_START')
      expect(
        types.filter((t) => t === 'REASONING_MESSAGE_CONTENT'),
      ).toHaveLength(2)
      expect(types).toContain('REASONING_MESSAGE_END')
      expect(types).toContain('REASONING_END')
      expect(types).toContain('TEXT_MESSAGE_START')

      expect(types.indexOf('REASONING_MESSAGE_END')).toBeLessThan(
        types.indexOf('TEXT_MESSAGE_START'),
      )
    })

    it('emits the tool call lifecycle', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([
          {
            id: 'resp_1',
            model: 'glm-5.2',
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
            model: 'glm-5.2',
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
        adapter.chatStream(baseOptions({ tools: [weatherTool] })),
      )
      const types = chunks.map((c) => c.type)

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

    it('yields RUN_ERROR instead of throwing on a client error', async () => {
      const adapter = createAdapter()
      openAIState.create.mockRejectedValueOnce(new Error('network down'))

      const chunks = await collect(adapter.chatStream(baseOptions()))
      const error = chunks.find((c) => c.type === 'RUN_ERROR') as any

      expect(error).toBeTruthy()
      expect(error.message).toMatch(/network down/i)
    })

    it('flags an exhausted stream with no finish_reason as incomplete', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([{ id: 'resp_1', model: 'glm-5.2' }]),
      )

      const chunks = await collect(adapter.chatStream(baseOptions()))
      const error = chunks.find((c) => c.type === 'RUN_ERROR') as any

      expect(error).toBeTruthy()
      expect(error.code).toBe('incomplete-stream')
      expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(false)
    })

    it('handles an empty messages array without crashing', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([
          {
            id: 'resp_1',
            model: 'glm-5.2',
            choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
          },
        ]),
      )

      const chunks = await collect(
        adapter.chatStream(baseOptions({ messages: [] })),
      )

      const callArgs = openAIState.create.mock.calls[0]!
      expect(callArgs[0].messages).toEqual([])
      expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    })

    it('passes request headers through to the SDK call', async () => {
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([
          {
            id: 'resp_1',
            model: 'glm-5.2',
            choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
          },
        ]),
      )

      await collect(
        adapter.chatStream(
          baseOptions({ request: { headers: { 'X-Test': '1' } } }),
        ),
      )

      const callArgs = openAIState.create.mock.calls[0]!
      expect(callArgs[1].headers).toEqual({ 'X-Test': '1' })
    })

    it('logs the request with the provider name', async () => {
      const logger = createNoopLogger()
      const adapter = createAdapter()
      openAIState.create.mockResolvedValueOnce(
        streamOf([
          {
            id: 'resp_1',
            model: 'glm-5.2',
            choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
          },
        ]),
      )

      await collect(adapter.chatStream(baseOptions({ logger: logger as any })))

      expect(logger.request).toHaveBeenCalled()
      expect(logger.request.mock.calls[0]![0]).toContain('provider=zai')
    })
  })
})
