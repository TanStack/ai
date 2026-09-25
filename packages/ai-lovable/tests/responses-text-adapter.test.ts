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
  createLovableResponsesText as _realCreate,
  lovableResponsesText as _realFactory,
} from '../src/adapters/responses-text'
import type { StreamChunk } from '@tanstack/ai'

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
    // openai-base keeps the SDK client as a private field; tests inject it
    // the same way as @tanstack/ai-vercel-gateway.
    Object.assign(adapter, {
      client: { responses: { create: pendingMockCreate } },
    })
    pendingMockCreate = undefined
  }
  return adapter
}

const createLovableResponsesText: typeof _realCreate = (
  model,
  apiKey,
  config,
) => applyPendingMock(_realCreate(model, apiKey, config))
const lovableResponsesText: typeof _realFactory = (model, config) =>
  applyPendingMock(_realFactory(model, config))

describe('Lovable Responses text adapter', () => {
  beforeEach(() => {
    pendingMockCreate = undefined
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a Responses adapter with name lovable', () => {
    const adapter = createLovableResponsesText('google/gemini-3.7-flash', 'k')

    expect(adapter.kind).toBe('text')
    expect(adapter.name).toBe('lovable')
    expect(adapter.model).toBe('google/gemini-3.7-flash')
  })

  it('creates a Responses adapter from LOVABLE_API_KEY', () => {
    vi.stubEnv('LOVABLE_API_KEY', 'env-key')

    const adapter = lovableResponsesText('openai/gpt-5.5')

    expect(adapter.kind).toBe('text')
    expect(adapter.model).toBe('openai/gpt-5.5')
  })

  it('emits RUN_STARTED then text from a Responses stream', async () => {
    setupMockSdkClient([{ type: 'response.output_text.delta', delta: 'hi' }])
    const adapter = createLovableResponsesText('openai/gpt-5.5', 'k')
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
})
