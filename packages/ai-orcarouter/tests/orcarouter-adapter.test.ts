import {
  describe,
  it,
  expect,
  vi,
  afterEach,
  beforeEach,
  type Mock,
} from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  createOrcaRouterText as _realCreateOrcaRouterText,
  orcaRouterText as _realOrcaRouterText,
} from '../src/adapters/text'
import { createOrcaRouterSummarize } from '../src/adapters/summarize'
import { withOrcaRouterDefaults } from '../src/utils/client'
import type { StreamChunk } from '@tanstack/ai'
import type { OrcaRouterTextProviderOptions } from '../src/index'

// Test helper: a silent logger for test chatStream calls.
const testLogger = resolveDebugOption(false)

// Stub the OpenAI SDK so adapter construction doesn't open a real network
// handle. The per-test mock client is injected post-construction via
// `setupMockSdkClient` (mirrors the ai-groq/ai-llmgateway pattern). We avoid
// relying on vi.mock to intercept transitive openai imports — the built
// openai-base dist resolves `openai` independently and is unaffected by
// vi.mock here.
vi.mock('openai', () => {
  return {
    default: class {
      chat = {
        completions: {
          create: vi.fn(),
        },
      }
    },
  }
})

// Helper to create async iterable from chunks
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

// Sets up a mock client on the most recently created adapter. Tests use the
// existing call order: `setupMockSdkClient(chunks)` first, then `const
// adapter = createOrcaRouterText(...)`. The wrapped factories below apply
// the pending mock to the returned adapter so it intercepts subsequent
// chatStream/structuredOutput calls.
let pendingMockCreate: Mock<(...args: Array<unknown>) => unknown> | undefined

function setupMockSdkClient(
  streamChunks: Array<Record<string, unknown>>,
  nonStreamResponse?: Record<string, unknown>,
): Mock<(...args: Array<unknown>) => unknown> {
  pendingMockCreate = vi.fn().mockImplementation((params) => {
    if (params.stream) {
      return Promise.resolve(createAsyncIterable(streamChunks))
    }
    return Promise.resolve(nonStreamResponse)
  })
  return pendingMockCreate
}

function applyPendingMock<T extends object>(adapter: T): T {
  if (pendingMockCreate) {
    ;(adapter as any).client = {
      chat: { completions: { create: pendingMockCreate } },
    }
    pendingMockCreate = undefined
  }
  return adapter
}
const createOrcaRouterText: typeof _realCreateOrcaRouterText = (
  model,
  apiKey,
  config,
) => applyPendingMock(_realCreateOrcaRouterText(model, apiKey, config))
const orcaRouterText: typeof _realOrcaRouterText = (model, config) =>
  applyPendingMock(_realOrcaRouterText(model, config))

// `createOrcaRouterSummarize` builds its own `OrcaRouterTextAdapter`
// internally, so the wrapped text factories above can't reach it. Apply the
// pending mock to the wrapper's private `textAdapter` instead, so summarize
// tests can assert on the request that actually goes out on the wire.
function applyPendingMockToSummarize<T extends object>(adapter: T): T {
  const inner = (adapter as any).textAdapter
  if (inner) applyPendingMock(inner)
  return adapter
}

describe('OrcaRouter adapters', () => {
  // Reset the module-level `pendingMockCreate` between tests so a previous
  // test's setupMockSdkClient call can't leak into a later test that
  // instantiates the adapter without setting up a mock.
  beforeEach(() => {
    pendingMockCreate = undefined
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('Client config', () => {
    it('defaults baseURL to the hosted gateway', () => {
      const config = withOrcaRouterDefaults({ apiKey: 'sk-orca_test' })
      expect(config.baseURL).toBe('https://api.orcarouter.ai/v1')
    })

    it('keeps an explicit baseURL', () => {
      const config = withOrcaRouterDefaults({
        apiKey: 'sk-orca_test',
        baseURL: 'https://gateway.example.com/v1',
      })
      expect(config.baseURL).toBe('https://gateway.example.com/v1')
    })
  })

  describe('Text adapter', () => {
    it('creates a text adapter with explicit API key', () => {
      const adapter = createOrcaRouterText('openai/gpt-5.5-pro', 'test-api-key')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('text')
      expect(adapter.name).toBe('orcarouter')
      expect(adapter.model).toBe('openai/gpt-5.5-pro')
    })

    it('creates a text adapter from environment variable', () => {
      vi.stubEnv('ORCAROUTER_API_KEY', 'env-api-key')

      const adapter = orcaRouterText('anthropic/claude-sonnet-5')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('text')
      expect(adapter.model).toBe('anthropic/claude-sonnet-5')
    })

    it('throws if ORCAROUTER_API_KEY is not set when using orcaRouterText', () => {
      vi.stubEnv('ORCAROUTER_API_KEY', '')

      expect(() => orcaRouterText('openai/gpt-5.5-pro')).toThrow(
        'ORCAROUTER_API_KEY',
      )
    })

    it('accepts uncurated and adaptive-routing model ids', () => {
      // OrcaRouter routes hundreds of models; ids outside the curated list
      // (including `provider/model` pins and `orcarouter/fusion`) must remain
      // valid at both type level and runtime.
      const adapter = createOrcaRouterText(
        'orcarouter/fusion',
        'test-api-key',
      )

      expect(adapter).toBeDefined()
      expect(adapter.model).toBe('orcarouter/fusion')
    })

    it('allows custom baseURL override', () => {
      const adapter = createOrcaRouterText(
        'openai/gpt-5.5-pro',
        'test-api-key',
        {
          baseURL: 'https://gateway.example.com/v1',
        },
      )

      expect(adapter).toBeDefined()
    })

    it('forwards sampling options from modelOptions', async () => {
      const streamChunks = [
        {
          id: 'chatcmpl-sampling',
          model: 'openai/gpt-5.5-pro',
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
        },
      ]

      const mockCreate = setupMockSdkClient(streamChunks)
      const adapter = createOrcaRouterText(
        'openai/gpt-5.5-pro',
        'test-api-key',
      )

      const modelOptions: OrcaRouterTextProviderOptions = {
        temperature: 0.5,
        top_p: 0.8,
        max_completion_tokens: 128,
        reasoning_effort: 'high',
      }

      for await (const _ of adapter.chatStream({
        model: 'openai/gpt-5.5-pro',
        messages: [{ role: 'user', content: 'Hello' }],
        modelOptions,
        logger: testLogger,
      })) {
        // consume stream
      }

      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
        temperature: 0.5,
        top_p: 0.8,
        max_completion_tokens: 128,
        reasoning_effort: 'high',
      })
    })
  })

  describe('Summarize adapter', () => {
    it('creates a summarize adapter wrapping the text adapter', () => {
      const adapter = createOrcaRouterSummarize(
        'openai/gpt-5.5-pro',
        'test-api-key',
      )

      expect(adapter).toBeDefined()
      expect(adapter.model).toBe('openai/gpt-5.5-pro')
    })

    // The summarize wrapper resolves `maxLength` to a token cap via its own
    // adapter `name`. OrcaRouter's OpenAI-compatible Chat Completions surface
    // reads `max_tokens`, so an unregistered name would silently drop the cap
    // and bill an unbounded completion.
    it('forwards maxLength to the wire as max_tokens', async () => {
      const mockCreate = setupMockSdkClient([
        {
          id: 'chatcmpl-summary',
          model: 'openai/gpt-5.5-pro',
          choices: [
            {
              delta: { content: 'A short summary.' },
              finish_reason: 'stop',
            },
          ],
        },
      ])
      const adapter = applyPendingMockToSummarize(
        createOrcaRouterSummarize('openai/gpt-5.5-pro', 'test-api-key'),
      )

      await adapter.summarize({
        model: 'openai/gpt-5.5-pro',
        text: 'Some long article text that needs summarizing.',
        maxLength: 100,
        logger: testLogger,
      })

      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({ max_tokens: 100 })
    })
  })
})

describe('OrcaRouter AG-UI event emission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pendingMockCreate = undefined
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('emits RUN_STARTED as the first event', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-5.5-pro',
        choices: [
          {
            delta: { content: 'Hello' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-5.5-pro',
        choices: [
          {
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 1,
          total_tokens: 6,
        },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = createOrcaRouterText(
      'openai/gpt-5.5-pro',
      'test-api-key',
    )
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
      model: 'openai/gpt-5.5-pro',
      messages: [{ role: 'user', content: 'Hello' }],
      logger: testLogger,
    })) {
      chunks.push(chunk)
    }

    expect(chunks[0]?.type).toBe('RUN_STARTED')
    if (chunks[0]?.type === 'RUN_STARTED') {
      expect(chunks[0].runId).toBeDefined()
      expect(chunks[0].model).toBe('openai/gpt-5.5-pro')
    }
  })

  it('emits TEXT_MESSAGE_START before TEXT_MESSAGE_CONTENT and finishes with usage', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-5.5-pro',
        choices: [
          {
            delta: { content: 'Hello' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-5.5-pro',
        choices: [
          {
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 1,
          total_tokens: 6,
        },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = createOrcaRouterText(
      'openai/gpt-5.5-pro',
      'test-api-key',
    )
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
      model: 'openai/gpt-5.5-pro',
      messages: [{ role: 'user', content: 'Hello' }],
      logger: testLogger,
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

  it('surfaces reasoning_content deltas as REASONING events', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-reasoning',
        model: 'deepseek/deepseek-v4-pro-0813',
        choices: [
          {
            delta: { reasoning_content: 'Thinking about it...' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-reasoning',
        model: 'deepseek/deepseek-v4-pro-0813',
        choices: [
          {
            delta: { content: 'The answer is 4.' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-reasoning',
        model: 'deepseek/deepseek-v4-pro-0813',
        choices: [
          {
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 10,
          total_tokens: 15,
        },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = createOrcaRouterText(
      'deepseek/deepseek-v4-pro-0813',
      'test-api-key',
    )
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
      model: 'deepseek/deepseek-v4-pro-0813',
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      logger: testLogger,
    })) {
      chunks.push(chunk)
    }

    const reasoningContent = chunks.find(
      (c) => c.type === 'REASONING_MESSAGE_CONTENT',
    )
    expect(reasoningContent).toBeDefined()
    if (reasoningContent?.type === 'REASONING_MESSAGE_CONTENT') {
      expect(reasoningContent.delta).toBe('Thinking about it...')
    }

    // Reasoning must close before the visible text message starts.
    const reasoningEndIndex = chunks.findIndex(
      (c) => c.type === 'REASONING_MESSAGE_END',
    )
    const textStartIndex = chunks.findIndex(
      (c) => c.type === 'TEXT_MESSAGE_START',
    )
    expect(reasoningEndIndex).toBeGreaterThan(-1)
    expect(textStartIndex).toBeGreaterThan(reasoningEndIndex)
  })

  it('emits AG-UI tool call events', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-456',
        model: 'openai/gpt-5.5-pro',
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_abc',
                  type: 'function',
                  function: {
                    name: 'lookup_weather',
                    arguments: '{"location":',
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-456',
        model: 'openai/gpt-5.5-pro',
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '"Paris"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-456',
        model: 'openai/gpt-5.5-pro',
        choices: [
          {
            delta: {},
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 8,
          total_tokens: 20,
        },
      },
    ]

    setupMockSdkClient(streamChunks)
    const adapter = createOrcaRouterText(
      'openai/gpt-5.5-pro',
      'test-api-key',
    )
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
      model: 'openai/gpt-5.5-pro',
      messages: [{ role: 'user', content: 'Weather in Paris?' }],
      logger: testLogger,
    })) {
      chunks.push(chunk)
    }

    const toolStart = chunks.find((c) => c.type === 'TOOL_CALL_START')
    expect(toolStart).toBeDefined()
    if (toolStart?.type === 'TOOL_CALL_START') {
      expect(toolStart.toolCallName).toBe('lookup_weather')
    }

    const toolArgs = chunks
      .filter((c) => c.type === 'TOOL_CALL_ARGS')
      .map((c) => (c.type === 'TOOL_CALL_ARGS' ? c.delta : ''))
      .join('')
    expect(toolArgs).toBe('{"location":"Paris"}')

    const toolEnd = chunks.find((c) => c.type === 'TOOL_CALL_END')
    expect(toolEnd).toBeDefined()

    const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(runFinishedChunk).toBeDefined()
    if (runFinishedChunk?.type === 'RUN_FINISHED') {
      expect(runFinishedChunk.finishReason).toBe('tool_calls')
    }
  })
})
