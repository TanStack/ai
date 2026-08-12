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
} from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const testLogger = resolveDebugOption(false)

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

const createVercelGatewayText: typeof _realCreateVercelGatewayText = (
  model,
  apiKey,
  config,
) => applyPendingMock(_realCreateVercelGatewayText(model, apiKey, config))
const vercelGatewayText: typeof _realVercelGatewayText = (model, config) =>
  applyPendingMock(_realVercelGatewayText(model, config))

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
    const chunks: Array<StreamChunk> = []

    for await (const chunk of adapter.chatStream({
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
  })

  it('sends gateway options under providerOptions.gateway', async () => {
    const create = setupMockSdkClient([
      { id: '1', choices: [{ delta: { content: 'hi' }, index: 0 }] },
    ])
    const adapter = createVercelGatewayText('openai/gpt-5.5', 'k')
    for await (const _chunk of adapter.chatStream({
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
