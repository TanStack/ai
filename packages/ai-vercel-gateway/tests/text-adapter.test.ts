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
import { EventType } from '@tanstack/ai'
import {
  createVercelGatewayText as _realCreateVercelGatewayText,
  vercelGatewayText as _realVercelGatewayText,
} from '../src/adapters/factory'
import type { AdapterYieldChunk } from '@tanstack/ai'

const testLogger = resolveDebugOption(false)

vi.mock('@tanstack/openai-base', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/openai-base')>()),
  createOpenAIClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}))

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

const createVercelGatewayText = (
  model: Parameters<typeof _realCreateVercelGatewayText>[0],
  apiKey: string,
) =>
  applyPendingMock(_realCreateVercelGatewayText(model, apiKey, { api: 'chat' }))
const vercelGatewayText = (
  model: Parameters<typeof _realVercelGatewayText>[0],
) => applyPendingMock(_realVercelGatewayText(model, { api: 'chat' }))

describe('Vercel Gateway text adapter', () => {
  beforeEach(() => {
    pendingMockCreate = undefined
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a text adapter with explicit API key', () => {
    const adapter = createVercelGatewayText('anthropic/claude-opus-5', 'k')

    expect(adapter.kind).toBe('text')
    expect(adapter.name).toBe('vercel-gateway')
    expect(adapter.model).toBe('anthropic/claude-opus-5')
  })

  it('creates a text adapter from AI_GATEWAY_API_KEY', () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'env-key')

    const adapter = vercelGatewayText('openai/gpt-5.5')

    expect(adapter.kind).toBe('text')
    expect(adapter.model).toBe('openai/gpt-5.5')
  })

  it('emits RUN_STARTED then text from a one-chunk stream', async () => {
    setupMockSdkClient([
      { id: '1', choices: [{ delta: { content: 'hi' }, index: 0 }] },
    ])
    const adapter = createVercelGatewayText('openai/gpt-5.5', 'k')
    const chunks: Array<AdapterYieldChunk> = []

    for await (const chunk of adapter.chatStream({
      threadId: 'thread-1',
      model: 'openai/gpt-5.5',
      messages: [{ role: 'user', content: 'hi' }],
      logger: testLogger,
    })) {
      chunks.push(chunk)
    }

    expect(chunks[0]?.type).toBe(EventType.RUN_STARTED)
    expect(
      chunks.some(
        (chunk) =>
          chunk.type === EventType.TEXT_MESSAGE_CONTENT &&
          'delta' in chunk &&
          chunk.delta === 'hi',
      ),
    ).toBe(true)
    expect(
      chunks.some(
        (chunk) => chunk.type === EventType.REASONING_MESSAGE_CONTENT,
      ),
    ).toBe(false)
  })

  it('surfaces delta.reasoning as reasoning events', async () => {
    setupMockSdkClient([
      {
        id: 'chatcmpl-reasoning',
        model: 'openai/gpt-5.5',
        choices: [
          {
            index: 0,
            delta: { reasoning: 'Think first. ' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-reasoning',
        model: 'openai/gpt-5.5',
        choices: [
          {
            index: 0,
            delta: { reasoning: 'Then answer.' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-reasoning',
        model: 'openai/gpt-5.5',
        choices: [
          {
            index: 0,
            delta: { content: '4' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-reasoning',
        model: 'openai/gpt-5.5',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ])
    const adapter = createVercelGatewayText('openai/gpt-5.5', 'k')
    const chunks: Array<AdapterYieldChunk> = []

    for await (const chunk of adapter.chatStream({
      threadId: 'thread-1',
      model: 'openai/gpt-5.5',
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      logger: testLogger,
    })) {
      chunks.push(chunk)
    }

    const reasoning = chunks.filter(
      (chunk) => chunk.type === EventType.REASONING_MESSAGE_CONTENT,
    )
    expect(
      reasoning.map((chunk) =>
        chunk.type === EventType.REASONING_MESSAGE_CONTENT ? chunk.delta : '',
      ),
    ).toEqual(['Think first. ', 'Then answer.'])

    const reasoningEndIndex = chunks.findIndex(
      (chunk) => chunk.type === EventType.REASONING_MESSAGE_END,
    )
    const textStartIndex = chunks.findIndex(
      (chunk) => chunk.type === EventType.TEXT_MESSAGE_START,
    )
    expect(reasoningEndIndex).toBeGreaterThan(-1)
    expect(textStartIndex).toBeGreaterThan(reasoningEndIndex)
    expect(
      chunks.some(
        (chunk) =>
          chunk.type === EventType.TEXT_MESSAGE_CONTENT &&
          'delta' in chunk &&
          chunk.delta === '4',
      ),
    ).toBe(true)
  })

  it('sends gateway options under providerOptions.gateway', async () => {
    const create = setupMockSdkClient([
      { id: '1', choices: [{ delta: { content: 'hi' }, index: 0 }] },
    ])
    const adapter = createVercelGatewayText('openai/gpt-5.5', 'k')
    for await (const _chunk of adapter.chatStream({
      threadId: 'thread-1',
      model: 'openai/gpt-5.5',
      messages: [{ role: 'user', content: 'hi' }],
      modelOptions: { gateway: { order: ['anthropic'] } },
      logger: testLogger,
    })) {
      // drain
    }
    const body = create.mock.calls[0]![0] as Record<string, unknown>
    expect(body.providerOptions).toEqual({
      gateway: { order: ['anthropic'] },
    })
    expect(body).not.toHaveProperty('gateway')
  })
})
