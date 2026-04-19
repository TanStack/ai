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
import type { StreamChunk, Tool } from '@tanstack/ai'

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

    for await (const chunk of adapter.chatStream({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
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

    for await (const chunk of adapter.chatStream({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
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

    for await (const chunk of adapter.chatStream({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
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

    for await (const chunk of adapter.chatStream({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: 'Weather in Berlin?' }],
      tools: [weatherTool],
    })) {
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

    for await (const chunk of adapter.chatStream({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const runErrorChunk = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runErrorChunk).toBeDefined()
    if (runErrorChunk?.type === 'RUN_ERROR') {
      expect(runErrorChunk.error.message).toBe('Stream interrupted')
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

    for await (const chunk of adapter.chatStream({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: 'Say hello' }],
    })) {
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
})
