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
  createLovableText as _realCreateLovableText,
  lovableText as _realLovableText,
} from '../src/adapters/factory'
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
    // openai-base keeps the SDK client as a private field; tests inject it
    // the same way as @tanstack/ai-vercel-gateway.
    Object.assign(adapter, {
      client: { chat: { completions: { create: pendingMockCreate } } },
    })
    pendingMockCreate = undefined
  }
  return adapter
}

const createLovableText = (
  model: Parameters<typeof _realCreateLovableText>[0],
  apiKey: string,
) => applyPendingMock(_realCreateLovableText(model, apiKey, { api: 'chat' }))
const lovableText = (model: Parameters<typeof _realLovableText>[0]) =>
  applyPendingMock(_realLovableText(model, { api: 'chat' }))

describe('Lovable text adapter', () => {
  beforeEach(() => {
    pendingMockCreate = undefined
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a text adapter with explicit API key', () => {
    const adapter = createLovableText('google/gemini-3.7-flash', 'k')

    expect(adapter.kind).toBe('text')
    expect(adapter.name).toBe('lovable')
    expect(adapter.model).toBe('google/gemini-3.7-flash')
  })

  it('creates a text adapter from LOVABLE_API_KEY', () => {
    vi.stubEnv('LOVABLE_API_KEY', 'env-key')

    const adapter = lovableText('openai/gpt-5.5')

    expect(adapter.kind).toBe('text')
    expect(adapter.model).toBe('openai/gpt-5.5')
  })

  it('emits RUN_STARTED then text from a one-chunk stream', async () => {
    setupMockSdkClient([
      { id: '1', choices: [{ delta: { content: 'hi' }, index: 0 }] },
    ])
    const adapter = createLovableText('openai/gpt-5.5', 'k')
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
