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
  createVercelGatewayResponsesText as _realCreate,
  vercelGatewayResponsesText as _realFactory,
} from '../src/adapters/responses-text'

const testLogger = resolveDebugOption(false)

vi.mock('openai', () => {
  return {
    default: class {
      responses = {
        create: vi.fn(),
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
): Mock<(...args: Array<unknown>) => unknown> {
  pendingMockCreate = vi.fn().mockImplementation(() => {
    return Promise.resolve(createAsyncIterable(streamChunks))
  })
  return pendingMockCreate
}

function applyPendingMock<T extends object>(adapter: T): T {
  if (pendingMockCreate) {
    ;(adapter as any).client = {
      responses: { create: pendingMockCreate },
    }
    pendingMockCreate = undefined
  }
  return adapter
}

const createVercelGatewayResponsesText: typeof _realCreate = (
  model,
  apiKey,
  config,
) => applyPendingMock(_realCreate(model, apiKey, config))
const vercelGatewayResponsesText: typeof _realFactory = (model, config) =>
  applyPendingMock(_realFactory(model, config))

describe('Vercel Gateway Responses text adapter', () => {
  beforeEach(() => {
    pendingMockCreate = undefined
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a Responses adapter with name vercel-gateway', () => {
    const adapter = createVercelGatewayResponsesText(
      'anthropic/claude-opus-5',
      'k',
    )

    expect(adapter.kind).toBe('text')
    expect(adapter.name).toBe('vercel-gateway')
    expect(adapter.model).toBe('anthropic/claude-opus-5')
  })

  it('creates a Responses adapter from AI_GATEWAY_API_KEY', () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'env-key')

    const adapter = vercelGatewayResponsesText('openai/gpt-5.5')

    expect(adapter.kind).toBe('text')
    expect(adapter.model).toBe('openai/gpt-5.5')
  })

  it('sends gateway options under providerOptions.gateway', async () => {
    const create = setupMockSdkClient([
      { type: 'response.output_text.delta', delta: 'hi' },
    ])
    const adapter = createVercelGatewayResponsesText('openai/gpt-5.5', 'k')
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

  it('puts gateway cost on RUN_FINISHED.usage', async () => {
    setupMockSdkClient([
      { type: 'response.output_text.delta', delta: 'OK' },
      {
        type: 'response.completed',
        response: {
          id: 'resp_1',
          model: 'openai/gpt-5.5',
          output: [],
          usage: {
            input_tokens: 3,
            output_tokens: 1,
            total_tokens: 4,
          },
          provider_metadata: {
            gateway: {
              cost: '0',
              marketCost: '0.000035',
              generationId: 'gen_1',
              routing: { finalProvider: 'anthropic' },
            },
          },
        },
      },
    ])
    const adapter = createVercelGatewayResponsesText('openai/gpt-5.5', 'k')
    const chunks = []
    for await (const chunk of adapter.chatStream({
      threadId: 'thread-1',
      model: 'openai/gpt-5.5',
      messages: [{ role: 'user', content: 'Say OK.' }],
      logger: testLogger,
    })) {
      chunks.push(chunk)
    }
    const finished = chunks.find((chunk) => chunk.type === 'RUN_FINISHED')
    expect(finished?.usage).toMatchObject({
      promptTokens: 3,
      completionTokens: 1,
      totalTokens: 4,
      cost: 0,
      costDetails: { upstreamCost: 0.000035 },
      providerUsageDetails: {
        generationId: 'gen_1',
        finalProvider: 'anthropic',
      },
    })
  })
})
