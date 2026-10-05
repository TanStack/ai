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

describe('inherited SDK replay contract', () => {
  const wrapperModel = 'openai/gpt-5.5'
  async function wireAdapter() {
    const actual = await vi.importActual<typeof import('openai')>('openai')
    const bodies: Array<Record<string, unknown>> = []
    const headers: Array<Headers> = []
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init)
      headers.push(request.headers)
      bodies.push(JSON.parse(await request.text()))
      const event = {
        type: 'response.completed',
        response: {
          id: 'generation-real',
          model: 'reported-model',
          status: 'completed',
          output: [],
        },
      }
      return new Response(
        'data: ' + JSON.stringify(event) + '\n\ndata: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }
    const adapter = _realCreate('openai/gpt-5.5', 'key')
    Object.assign(adapter, {
      client: new actual.default({
        apiKey: 'key',
        baseURL: 'https://wrapper.invalid/v1',
        fetch: fetcher,
      }),
    })
    return { adapter, bodies, headers }
  }

  it.each([false, true])(
    'keeps the full ordinary SDK body for sameSource=%s',
    async (sameSource) => {
      const mock = await wireAdapter()
      const messages: Array<import('@tanstack/ai').ModelMessage> = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: 'Prior',
          ...(sameSource && {
            metadata: {
              tanstack: {
                source: {
                  provider: 'lovable',
                  api: 'openai-responses',
                  model: wrapperModel,
                },
              },
            },
          }),
        },
      ]
      const original = JSON.stringify(messages)
      const chunks = []
      for await (const chunk of mock.adapter.chatStream({
        logger: resolveDebugOption(false),
        model: wrapperModel,
        messages,
        systemPrompts: ['System'],
        modelOptions: { temperature: 0.2, top_p: 0.7 },
        request: { headers: { 'x-request': 'kept' } },
      }))
        chunks.push(chunk)
      expect(mock.bodies).toEqual([
        {
          temperature: 0.2,
          top_p: 0.7,
          model: wrapperModel,
          instructions: 'System',
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'Hello' }],
            },
            { type: 'message', role: 'assistant', content: 'Prior' },
          ],
          stream: true,
        },
      ])
      expect(mock.headers[0]?.get('x-request')).toBe('kept')
      expect(chunks[0]).toMatchObject({
        metadata: {
          tanstack: {
            source: {
              provider: 'lovable',
              api: 'openai-responses',
              model: wrapperModel,
            },
          },
        },
      })
      expect(chunks.at(-1)).toMatchObject({
        responseId: 'generation-real',
        model: 'reported-model',
      })
      expect(JSON.stringify(messages)).toBe(original)
    },
  )

  it('prepares foreign history before wrapper hooks and keeps tools[]', async () => {
    const mock = await wireAdapter()
    const messages: Array<import('@tanstack/ai').ModelMessage> = [
      {
        role: 'assistant',
        content: 'Visible',
        thinking: [{ content: 'Readable', signature: 'foreign-opaque' }],
        metadata: {
          tanstack: {
            source: { provider: 'foreign', api: 'foreign', model: 'foreign' },
          },
        },
        toolCalls: [
          {
            id: 'call|fc/item',
            type: 'function',
            function: { name: 'inspect', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'call|fc/item', content: 'done' },
    ]
    const original = JSON.stringify(messages)
    for await (const _chunk of mock.adapter.chatStream({
      logger: resolveDebugOption(false),
      model: wrapperModel,
      messages,
    })) {
    }
    expect(mock.bodies[0]?.tools).toEqual([])
    expect(JSON.stringify(mock.bodies)).toContain('Readable')
    expect(JSON.stringify(mock.bodies)).not.toContain('foreign-opaque')
    expect(JSON.stringify(mock.bodies)).not.toContain('call|fc/item')
    expect(JSON.stringify(messages)).toBe(original)
  })
})
