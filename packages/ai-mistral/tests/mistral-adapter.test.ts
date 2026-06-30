import {
  describe,
  it,
  expect,
  vi,
  afterEach,
  beforeEach,
  type Mock,
} from 'vitest'
import { createMistralText, mistralText } from '../src/adapters/text'
import { transformNullsToUndefined } from '../src/utils/schema-converter'
import type { StreamChunk, Tool, TextOptions } from '@tanstack/ai'
import type { MistralTextProviderOptions } from '../src/adapters/text'

/**
 * Builds chat options for tests. `chatStream`'s `TextOptions` requires fields
 * (e.g. `logger`) that the adapter only consults when provided; the cast
 * lets tests focus on the inputs they actually exercise without rebuilding
 * a full options object on every call.
 */
function chatOpts(
  opts: Partial<TextOptions<MistralTextProviderOptions>> & {
    model: string
    messages: Array<{
      role: 'user' | 'assistant' | 'tool'
      content: unknown
      toolCallId?: string
      toolCalls?: Array<unknown>
    }>
  },
): TextOptions<MistralTextProviderOptions> {
  return opts as unknown as TextOptions<MistralTextProviderOptions>
}

// Declare mocks at module level
let mockComplete: Mock<(...args: Array<unknown>) => unknown>

// Mock the Mistral SDK (constructor still used for structuredOutput)
vi.mock('@mistralai/mistralai', () => {
  return {
    Mistral: class {
      chat = {
        complete: (...args: Array<unknown>) => mockComplete(...args),
      }
      HTTPClient = class {}
    },
    HTTPClient: class {
      addHook() {}
    },
  }
})

function toApiChunk(chunk: Record<string, unknown>): Record<string, unknown> {
  const choices = (chunk.choices as Array<Record<string, unknown>>) ?? []
  const result: Record<string, unknown> = {
    id: chunk.id,
    model: chunk.model,
    object: 'chat.completion.chunk',
    created: 0,
    choices: choices.map((choice) => {
      const delta = (choice.delta as Record<string, unknown>) ?? {}
      const toolCalls = delta.toolCalls as
        | Array<Record<string, unknown>>
        | undefined
      return {
        index: choice.index ?? 0,
        delta: {
          role: delta.role,
          content: delta.content,
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: choice.finishReason ?? null,
      }
    }),
  }
  if (chunk.usage) {
    const u = chunk.usage as Record<string, unknown>
    result.usage = {
      prompt_tokens: u.promptTokens,
      completion_tokens: u.completionTokens,
      total_tokens: u.totalTokens,
    }
  }
  return result
}

function setupMockStream(chunks: Array<Record<string, unknown>>) {
  const sseBody =
    chunks.map((c) => `data: ${JSON.stringify(toApiChunk(c))}`).join('\n\n') +
    '\n\ndata: [DONE]\n\n'
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseBody))
          controller.close()
        },
      }),
    }),
  )
  mockComplete = vi.fn()
}

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

describe('Mistral adapters', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  describe('Text adapter', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('creates a text adapter with explicit API key', () => {
      const adapter = createMistralText('mistral-large-latest', 'test-api-key')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('text')
      expect(adapter.name).toBe('mistral')
      expect(adapter.model).toBe('mistral-large-latest')
    })

    it('creates a text adapter from environment variable', () => {
      vi.stubEnv('MISTRAL_API_KEY', 'env-api-key')

      const adapter = mistralText('ministral-8b-latest')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('text')
      expect(adapter.model).toBe('ministral-8b-latest')
    })

    it('throws if MISTRAL_API_KEY is not set when using mistralText', () => {
      vi.stubEnv('MISTRAL_API_KEY', '')

      expect(() => mistralText('mistral-large-latest')).toThrow(
        'MISTRAL_API_KEY is required',
      )
    })

    it('allows custom serverURL override', () => {
      const adapter = createMistralText(
        'mistral-large-latest',
        'test-api-key',
        {
          serverURL: 'https://custom.api.example.com',
        },
      )

      expect(adapter).toBeDefined()
    })
  })
})

describe('Mistral AG-UI event emission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('emits RUN_STARTED as the first event', async () => {
    const streamChunks = [
      {
        id: 'cmpl-123',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: { content: 'Hello' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'cmpl-123',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 5,
          completionTokens: 1,
          totalTokens: 6,
        },
      },
    ]

    setupMockStream(streamChunks)
    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream(
      chatOpts({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    )) {
      chunks.push(chunk)
    }

    expect(chunks[0]?.type).toBe('RUN_STARTED')
    if (chunks[0]?.type === 'RUN_STARTED') {
      expect(chunks[0].runId).toBeDefined()
      expect(chunks[0].model).toBe('mistral-large-latest')
    }
  })

  it('emits TEXT_MESSAGE_START before TEXT_MESSAGE_CONTENT', async () => {
    const streamChunks = [
      {
        id: 'cmpl-123',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: { content: 'Hello' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'cmpl-123',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 5,
          completionTokens: 1,
          totalTokens: 6,
        },
      },
    ]

    setupMockStream(streamChunks)
    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream(
      chatOpts({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    )) {
      chunks.push(chunk)
    }

    const textStartIndex = chunks.findIndex(
      (c) => c.type === 'TEXT_MESSAGE_START',
    )
    const textContentIndex = chunks.findIndex(
      (c) => c.type === 'TEXT_MESSAGE_CONTENT',
    )

    expect(textStartIndex).toBeGreaterThan(-1)
    expect(textContentIndex).toBeGreaterThan(-1)
    expect(textStartIndex).toBeLessThan(textContentIndex)
  })

  it('emits TEXT_MESSAGE_END and RUN_FINISHED at the end', async () => {
    const streamChunks = [
      {
        id: 'cmpl-123',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: { content: 'Hello' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'cmpl-123',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 5,
          completionTokens: 1,
          totalTokens: 6,
        },
      },
    ]

    setupMockStream(streamChunks)
    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream(
      chatOpts({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    )) {
      chunks.push(chunk)
    }

    const textEndChunk = chunks.find((c) => c.type === 'TEXT_MESSAGE_END')
    expect(textEndChunk).toBeDefined()

    const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(runFinishedChunk).toBeDefined()
    if (runFinishedChunk?.type === 'RUN_FINISHED') {
      expect(runFinishedChunk.finishReason).toBe('stop')
      expect(runFinishedChunk.usage).toMatchObject({
        promptTokens: 5,
        completionTokens: 1,
        totalTokens: 6,
      })
    }
  })

  it('emits AG-UI tool call events', async () => {
    const streamChunks = [
      {
        id: 'cmpl-456',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: {
              toolCalls: [
                {
                  index: 0,
                  id: 'call_abc123',
                  type: 'function',
                  function: {
                    name: 'lookup_weather',
                    arguments: '{"location":',
                  },
                },
              ],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'cmpl-456',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: {
              toolCalls: [
                {
                  index: 0,
                  function: {
                    arguments: '"Berlin"}',
                  },
                },
              ],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'cmpl-456',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: {},
            finishReason: 'tool_calls',
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      },
    ]

    setupMockStream(streamChunks)
    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream(
      chatOpts({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Weather in Berlin?' }],
        tools: [weatherTool],
      }),
    )) {
      chunks.push(chunk)
    }

    const toolStartChunk = chunks.find((c) => c.type === 'TOOL_CALL_START')
    expect(toolStartChunk).toBeDefined()
    if (toolStartChunk?.type === 'TOOL_CALL_START') {
      expect(toolStartChunk.toolCallId).toBe('call_abc123')
      expect(toolStartChunk.toolName).toBe('lookup_weather')
    }

    const toolArgsChunks = chunks.filter((c) => c.type === 'TOOL_CALL_ARGS')
    expect(toolArgsChunks.length).toBeGreaterThan(0)

    const toolEndChunk = chunks.find((c) => c.type === 'TOOL_CALL_END')
    expect(toolEndChunk).toBeDefined()
    if (toolEndChunk?.type === 'TOOL_CALL_END') {
      expect(toolEndChunk.toolCallId).toBe('call_abc123')
      expect(toolEndChunk.toolName).toBe('lookup_weather')
      expect(toolEndChunk.input).toEqual({ location: 'Berlin' })
    }

    const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(runFinishedChunk).toBeDefined()
    if (runFinishedChunk?.type === 'RUN_FINISHED') {
      expect(runFinishedChunk.finishReason).toBe('tool_calls')
    }
  })

  it('emits RUN_ERROR on stream error', async () => {
    const firstChunk = JSON.stringify({
      id: 'cmpl-123',
      model: 'mistral-large-latest',
      choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(`data: ${firstChunk}\n\n`),
            )
            controller.error(new Error('Stream interrupted'))
          },
        }),
      }),
    )
    mockComplete = vi.fn()

    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    const chunks: Array<StreamChunk> = []
    let thrownError: Error | undefined

    try {
      for await (const chunk of adapter.chatStream(
        chatOpts({
          model: 'mistral-large-latest',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      )) {
        chunks.push(chunk)
      }
    } catch (err) {
      thrownError = err as Error
    }

    expect(thrownError).toBeDefined()
    expect(thrownError?.message).toBe('Stream interrupted')

    const runErrorChunk = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runErrorChunk).toBeDefined()
    if (runErrorChunk?.type === 'RUN_ERROR') {
      expect(runErrorChunk.error?.message).toBe('Stream interrupted')
    }
  })

  it('streams content with correct accumulated values', async () => {
    const streamChunks = [
      {
        id: 'cmpl-stream',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: { content: 'Hello ' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'cmpl-stream',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: { content: 'world' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'cmpl-stream',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 5,
          completionTokens: 2,
          totalTokens: 7,
        },
      },
    ]

    setupMockStream(streamChunks)
    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream(
      chatOpts({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Say hello' }],
      }),
    )) {
      chunks.push(chunk)
    }

    const contentChunks = chunks.filter(
      (c) => c.type === 'TEXT_MESSAGE_CONTENT',
    )
    expect(contentChunks.length).toBe(2)

    const firstContent = contentChunks[0]
    if (firstContent?.type === 'TEXT_MESSAGE_CONTENT') {
      expect(firstContent.delta).toBe('Hello ')
      expect(firstContent.content).toBe('Hello ')
    }

    const secondContent = contentChunks[1]
    if (secondContent?.type === 'TEXT_MESSAGE_CONTENT') {
      expect(secondContent.delta).toBe('world')
      expect(secondContent.content).toBe('Hello world')
    }
  })

  it('emits exactly one RUN_ERROR on stream error (no duplicates from inner+outer catch)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify(
                  toApiChunk({
                    id: 'cmpl-dup',
                    model: 'mistral-large-latest',
                    choices: [
                      { index: 0, delta: { content: 'x' }, finishReason: null },
                    ],
                  }),
                )}\n\n`,
              ),
            )
            controller.error(new Error('boom'))
          },
        }),
      }),
    )

    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    const chunks: Array<StreamChunk> = []

    try {
      for await (const chunk of adapter.chatStream(
        chatOpts({
          model: 'mistral-large-latest',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      )) {
        chunks.push(chunk)
      }
    } catch {
      // expected
    }

    const runErrors = chunks.filter((c) => c.type === 'RUN_ERROR')
    expect(runErrors).toHaveLength(1)
  })

  it('flushes TEXT_MESSAGE_END and RUN_FINISHED when stream ends without finish_reason', async () => {
    // Stream emits content, then [DONE] without ever sending a finish_reason
    // chunk. Consumers must still receive matched lifecycle events.
    const sseBody = `data: ${JSON.stringify(
      toApiChunk({
        id: 'cmpl-cut',
        model: 'mistral-large-latest',
        choices: [
          { index: 0, delta: { content: 'partial' }, finishReason: null },
        ],
      }),
    )}\n\ndata: [DONE]\n\n`

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sseBody))
            controller.close()
          },
        }),
      }),
    )
    mockComplete = vi.fn()

    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream(
      chatOpts({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Go' }],
      }),
    )) {
      chunks.push(chunk)
    }

    const types: Array<string> = chunks.map((c) => c.type)
    expect(types).toContain('TEXT_MESSAGE_START')
    expect(types).toContain('TEXT_MESSAGE_END')
    expect(types).toContain('RUN_FINISHED')
    expect(types.indexOf('TEXT_MESSAGE_END')).toBeLessThan(
      types.indexOf('RUN_FINISHED'),
    )
  })

  it('replays buffered tool-call args when arguments arrive before id and name', async () => {
    // First delta carries arguments fragment but no id/name; second delta
    // brings id+name; third closes the call. Consumers tracking ARGS deltas
    // must see the buffered prefix replayed once START is emitted.
    setupMockStream([
      {
        id: 'cmpl-replay',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: {
              toolCalls: [
                {
                  index: 0,
                  function: { arguments: '{"loc' },
                },
              ],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'cmpl-replay',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: {
              toolCalls: [
                {
                  index: 0,
                  id: 'tc_1',
                  function: { name: 'lookup_weather' },
                },
              ],
            },
            finishReason: null,
          },
        ],
      },
      {
        id: 'cmpl-replay',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: {
              toolCalls: [
                { index: 0, function: { arguments: 'ation":"Berlin"}' } },
              ],
            },
            finishReason: 'tool_calls',
          },
        ],
      },
    ])

    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream(
      chatOpts({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Weather in Berlin?' }],
        tools: [weatherTool],
      }),
    )) {
      chunks.push(chunk)
    }

    const argsChunks = chunks.filter((c) => c.type === 'TOOL_CALL_ARGS')
    const concatenated = argsChunks
      .map((c) =>
        c.type === 'TOOL_CALL_ARGS' ? (c as { delta: string }).delta : '',
      )
      .join('')
    expect(concatenated).toBe('{"location":"Berlin"}')

    // The TOOL_CALL_END input must reflect the full JSON
    const endChunk = chunks.find((c) => c.type === 'TOOL_CALL_END')
    if (endChunk?.type === 'TOOL_CALL_END') {
      expect(endChunk.input).toEqual({ location: 'Berlin' })
    }
  })

  it('throws on malformed tool-call arguments rather than silently substituting {}', async () => {
    setupMockStream([
      {
        id: 'cmpl-bad',
        model: 'mistral-large-latest',
        choices: [
          {
            index: 0,
            delta: {
              toolCalls: [
                {
                  index: 0,
                  id: 'tc_bad',
                  function: { name: 'lookup_weather', arguments: '{not json' },
                },
              ],
            },
            finishReason: 'tool_calls',
          },
        ],
      },
    ])

    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    let caught: Error | undefined
    try {
      for await (const _chunk of adapter.chatStream(
        chatOpts({
          model: 'mistral-large-latest',
          messages: [{ role: 'user', content: 'x' }],
          tools: [weatherTool],
        }),
      )) {
        // drain
      }
    } catch (err) {
      caught = err as Error
    }

    expect(caught).toBeDefined()
    expect(caught?.message).toMatch(/Failed to parse tool call arguments/)
    expect(caught?.message).toMatch(/lookup_weather/)
  })

  it('sends stream_options.include_usage so Mistral returns usage on streaming', async () => {
    let capturedBody: unknown
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { body?: string }) => {
        capturedBody = init?.body ? JSON.parse(init.body) : undefined
        return {
          ok: true,
          status: 200,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
              controller.close()
            },
          }),
        }
      }),
    )
    mockComplete = vi.fn()

    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    for await (const _chunk of adapter.chatStream(
      chatOpts({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    )) {
      // drain
    }

    expect(capturedBody).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    })
  })

  it('reads temperature and top_p from modelOptions when not set at top level', async () => {
    let capturedBody: { temperature?: number; top_p?: number } | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { body?: string }) => {
        capturedBody = init?.body ? JSON.parse(init.body) : undefined
        return {
          ok: true,
          status: 200,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
              controller.close()
            },
          }),
        }
      }),
    )
    mockComplete = vi.fn()

    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    for await (const _chunk of adapter.chatStream(
      chatOpts({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: 'Hi' }],
        modelOptions: { temperature: 0.42, top_p: 0.9 },
      }),
    )) {
      // drain
    }

    expect(capturedBody?.temperature).toBe(0.42)
    expect(capturedBody?.top_p).toBe(0.9)
  })

  it('throws a clear error for unsupported content part types', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
            controller.close()
          },
        }),
      }),
    )
    mockComplete = vi.fn()

    const adapter = createMistralText('mistral-large-latest', 'test-api-key')
    let caught: Error | undefined
    try {
      for await (const _chunk of adapter.chatStream(
        chatOpts({
          model: 'mistral-large-latest',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'audio',
                  source: { type: 'url', value: 'https://example.com/a.mp3' },
                },
              ],
            },
          ],
        }),
      )) {
        // drain
      }
    } catch (err) {
      caught = err as Error
    }

    expect(caught).toBeDefined()
    expect(caught?.message).toMatch(
      /Mistral text adapter does not support content part of type 'audio'/,
    )
  })
})

describe('Mistral reasoning (magistral-* models)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('emits REASONING_* events when delta.content contains thinking parts, before any TEXT_MESSAGE_*', async () => {
    // Magistral streaming format: delta.content is an array containing
    // `{ type: 'thinking', thinking: [{ type: 'text', text: '...' }] }`.
    // We build the SSE body by hand because `toApiChunk` strips non-text parts.
    const sseChunks: Array<Record<string, unknown>> = [
      {
        id: 'cmpl-think-1',
        model: 'magistral-medium-latest',
        object: 'chat.completion.chunk',
        created: 0,
        choices: [
          {
            index: 0,
            delta: {
              content: [
                {
                  type: 'thinking',
                  thinking: [{ type: 'text', text: 'Let me think... ' }],
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'cmpl-think-1',
        model: 'magistral-medium-latest',
        object: 'chat.completion.chunk',
        created: 0,
        choices: [
          {
            index: 0,
            delta: {
              content: [
                {
                  type: 'thinking',
                  thinking: [{ type: 'text', text: 'the answer is 42.' }],
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'cmpl-think-1',
        model: 'magistral-medium-latest',
        object: 'chat.completion.chunk',
        created: 0,
        choices: [
          {
            index: 0,
            delta: { content: 'The answer is 42.' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'cmpl-think-1',
        model: 'magistral-medium-latest',
        object: 'chat.completion.chunk',
        created: 0,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ]

    const sseBody =
      sseChunks.map((c) => `data: ${JSON.stringify(c)}`).join('\n\n') +
      '\n\ndata: [DONE]\n\n'

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sseBody))
            controller.close()
          },
        }),
      }),
    )
    mockComplete = vi.fn()

    const adapter = createMistralText('magistral-medium-latest', 'test-api-key')
    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream(
      chatOpts({
        model: 'magistral-medium-latest',
        messages: [{ role: 'user', content: 'What is the answer?' }],
      }),
    )) {
      chunks.push(chunk)
    }

    const types: Array<string> = chunks.map((c) => c.type)

    // Reasoning lifecycle is present and ordered correctly
    expect(types).toContain('REASONING_START')
    expect(types).toContain('REASONING_MESSAGE_START')
    expect(types).toContain('REASONING_MESSAGE_CONTENT')
    expect(types).toContain('REASONING_MESSAGE_END')
    expect(types).toContain('REASONING_END')

    expect(types.indexOf('REASONING_START')).toBeLessThan(
      types.indexOf('REASONING_MESSAGE_CONTENT'),
    )
    // REASONING_END must precede TEXT_MESSAGE_START
    expect(types.indexOf('REASONING_END')).toBeLessThan(
      types.indexOf('TEXT_MESSAGE_START'),
    )

    // Reasoning content reassembles correctly
    const reasoningDeltas = chunks.filter(
      (c) => c.type === 'REASONING_MESSAGE_CONTENT',
    )
    const reasoningText = reasoningDeltas
      .map((c) =>
        c.type === 'REASONING_MESSAGE_CONTENT'
          ? (c as { delta: string }).delta
          : '',
      )
      .join('')
    expect(reasoningText).toBe('Let me think... the answer is 42.')
  })

  it('emits REASONING_* events when the upstream uses delta.reasoning_content (OpenAI-compat / aimock format)', async () => {
    // OpenAI-compatible deployments (DeepSeek, Groq for reasoning models,
    // and the aimock test backend) stream reasoning via delta.reasoning_content
    // rather than as a thinking content part. The adapter must accept both
    // shapes for the e2e suite to run against aimock.
    const sseChunks: Array<Record<string, unknown>> = [
      {
        id: 'cmpl-rc',
        model: 'magistral-medium-latest',
        object: 'chat.completion.chunk',
        created: 0,
        choices: [
          {
            index: 0,
            delta: { reasoning_content: 'Considering options...' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'cmpl-rc',
        model: 'magistral-medium-latest',
        object: 'chat.completion.chunk',
        created: 0,
        choices: [
          {
            index: 0,
            delta: { content: 'Final answer.' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'cmpl-rc',
        model: 'magistral-medium-latest',
        object: 'chat.completion.chunk',
        created: 0,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ]
    const sseBody =
      sseChunks.map((c) => `data: ${JSON.stringify(c)}`).join('\n\n') +
      '\n\ndata: [DONE]\n\n'

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sseBody))
            controller.close()
          },
        }),
      }),
    )
    mockComplete = vi.fn()

    const adapter = createMistralText('magistral-medium-latest', 'test-api-key')
    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream(
      chatOpts({
        model: 'magistral-medium-latest',
        messages: [{ role: 'user', content: 'Decide.' }],
      }),
    )) {
      chunks.push(chunk)
    }

    const types: Array<string> = chunks.map((c) => c.type)
    expect(types).toContain('REASONING_MESSAGE_CONTENT')
    expect(types.indexOf('REASONING_END')).toBeLessThan(
      types.indexOf('TEXT_MESSAGE_START'),
    )

    const reasoningText = chunks
      .filter((c) => c.type === 'REASONING_MESSAGE_CONTENT')
      .map((c) =>
        c.type === 'REASONING_MESSAGE_CONTENT'
          ? (c as { delta: string }).delta
          : '',
      )
      .join('')
    expect(reasoningText).toBe('Considering options...')
  })

  it('closes reasoning lifecycle if the run finishes while still in thinking', async () => {
    const sseChunks: Array<Record<string, unknown>> = [
      {
        id: 'cmpl-think-only',
        model: 'magistral-medium-latest',
        object: 'chat.completion.chunk',
        created: 0,
        choices: [
          {
            index: 0,
            delta: {
              content: [
                {
                  type: 'thinking',
                  thinking: [{ type: 'text', text: 'pondering...' }],
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'cmpl-think-only',
        model: 'magistral-medium-latest',
        object: 'chat.completion.chunk',
        created: 0,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ]
    const sseBody =
      sseChunks.map((c) => `data: ${JSON.stringify(c)}`).join('\n\n') +
      '\n\ndata: [DONE]\n\n'

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sseBody))
            controller.close()
          },
        }),
      }),
    )
    mockComplete = vi.fn()

    const adapter = createMistralText('magistral-medium-latest', 'test-api-key')
    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream(
      chatOpts({
        model: 'magistral-medium-latest',
        messages: [{ role: 'user', content: 'Just think.' }],
      }),
    )) {
      chunks.push(chunk)
    }

    const types: Array<string> = chunks.map((c) => c.type)
    expect(types).toContain('REASONING_END')
    expect(types).toContain('RUN_FINISHED')
    expect(types.indexOf('REASONING_END')).toBeLessThan(
      types.indexOf('RUN_FINISHED'),
    )
    // No TEXT_MESSAGE_START — the run was reasoning-only
    expect(types).not.toContain('TEXT_MESSAGE_START')
  })
})

describe('transformNullsToUndefined (regression coverage)', () => {
  it('preserves array length and indices — null elements become undefined slots', () => {
    const input = ['a', null, 'b', null]
    const out = transformNullsToUndefined(input)
    expect(out).toHaveLength(4)
    expect(out[0]).toBe('a')
    expect(out[1]).toBeUndefined()
    expect(out[2]).toBe('b')
    expect(out[3]).toBeUndefined()
  })

  it('preserves object keys whose values were null — value becomes undefined, key remains', () => {
    const input = { a: 1, b: null, c: 'x' }
    const out = transformNullsToUndefined(input) as Record<string, unknown>
    expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c'])
    expect(out.a).toBe(1)
    expect(out.b).toBeUndefined()
    expect(out.c).toBe('x')
  })

  it('recurses into nested arrays and objects', () => {
    const input = { items: [{ x: null, y: 1 }, null, { x: 2, y: null }] }
    const out = transformNullsToUndefined(input) as {
      items: Array<{ x: unknown; y: unknown } | undefined>
    }
    expect(out.items).toHaveLength(3)
    expect(out.items[0]).toEqual({ x: undefined, y: 1 })
    expect(out.items[1]).toBeUndefined()
    expect(out.items[2]).toEqual({ x: 2, y: undefined })
  })
})
