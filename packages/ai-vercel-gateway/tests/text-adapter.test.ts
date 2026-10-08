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
        id: 'generation-real',
        object: 'chat.completion.chunk',
        model: 'reported-model',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }
      return new Response(
        'data: ' + JSON.stringify(event) + '\n\ndata: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }
    const adapter = _realCreateVercelGatewayText('openai/gpt-5.5', 'key', {
      api: 'chat',
    })
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
                  provider: 'vercel-gateway',
                  api: 'openai-completions',
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
        modelOptions: { temperature: 0.2 },
        request: { headers: { 'x-request': 'kept' } },
      }))
        chunks.push(chunk)
      expect(mock.bodies).toEqual([
        {
          temperature: 0.2,
          model: wrapperModel,
          messages: [
            { role: 'system', content: 'System' },
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Prior' },
          ],
          stream: true,
          stream_options: { include_usage: true },
        },
      ])
      expect(mock.headers[0]?.get('x-request')).toBe('kept')
      expect(chunks[0]).toMatchObject({
        metadata: {
          tanstack: {
            source: {
              provider: 'vercel-gateway',
              api: 'openai-completions',
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
