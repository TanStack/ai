import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { ChatRequest$outboundSchema } from '@openrouter/sdk/models'
import { createOpenRouterText } from '../src/adapters/text'
import type { StreamChunk, Tool } from '@tanstack/ai'

/**
 * Wire-format verification for OpenRouter function-tool prompt caching.
 *
 * A `cacheControl` breakpoint placed on a tool's `metadata` enables Anthropic
 * prompt caching of tool definitions when those models are routed through
 * OpenRouter — the equivalent of `@tanstack/ai-anthropic` forwarding
 * `cache_control` on a custom tool directly.
 *
 * The catch (see #822): the SDK's `ChatFunctionToolFunction` accepts the field
 * as a top-level camelCase `cacheControl` and remaps it to `cache_control` on
 * the wire. Its outbound Zod schema strips an unrecognized snake_case
 * `cache_control`, so the converter must emit `cacheControl`. These tests
 * replay the adapter's request through the same `ChatRequest$outboundSchema`
 * the SDK uses, asserting `cache_control` actually reaches the wire.
 */

let mockSend: any

// eslint-disable-next-line @typescript-eslint/require-await
vi.mock('@openrouter/sdk', async () => {
  function OpenRouter(this: {
    chat: { send: (...args: Array<unknown>) => unknown }
  }) {
    this.chat = {
      send: (...args: Array<unknown>) => mockSend(...args),
    }
  }
  return { OpenRouter }
})

function createAsyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        // eslint-disable-next-line @typescript-eslint/require-await
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

function setupMockSend(): void {
  mockSend = vi.fn().mockImplementation((params) => {
    if (params.chatRequest?.stream) {
      return Promise.resolve(
        createAsyncIterable([
          {
            id: 'x',
            model: 'openai/gpt-4o-mini',
            choices: [{ delta: { content: 'ok' }, finishReason: 'stop' }],
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          },
        ]),
      )
    }
    return Promise.resolve({})
  })
}

async function captureSerializedTool(tool: Tool): Promise<unknown> {
  setupMockSend()
  const adapter = createOpenRouterText('openai/gpt-4o-mini', 'test-key')
  const chunks: Array<StreamChunk> = []
  for await (const c of chat({
    adapter,
    messages: [{ role: 'user', content: 'hi' }],
    tools: [tool],
  })) {
    chunks.push(c)
  }
  const [rawParams] = mockSend.mock.calls[0]!
  const serialized = ChatRequest$outboundSchema.parse(
    rawParams.chatRequest,
  ) as {
    tools?: Array<unknown>
  }
  return serialized.tools?.[0]
}

const baseTool: Tool = {
  name: 'lookup',
  description: 'Look something up',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
}

describe('OpenRouter function-tool wire format (post-SDK serialization)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards metadata.cacheControl as cache_control on the wire', async () => {
    const wireTool = await captureSerializedTool({
      ...baseTool,
      metadata: { cacheControl: { type: 'ephemeral' } },
    })
    expect(wireTool).toMatchObject({
      type: 'function',
      function: { name: 'lookup' },
      cache_control: { type: 'ephemeral' },
    })
  })

  it('forwards the cache TTL when supplied', async () => {
    const wireTool = await captureSerializedTool({
      ...baseTool,
      metadata: { cacheControl: { type: 'ephemeral', ttl: '1h' } },
    })
    expect(wireTool).toMatchObject({
      cache_control: { type: 'ephemeral', ttl: '1h' },
    })
  })

  it('omits cache_control entirely when no cacheControl is supplied', async () => {
    const wireTool = (await captureSerializedTool(baseTool)) as {
      cache_control?: unknown
    }
    expect(wireTool).not.toHaveProperty('cache_control')
  })
})
