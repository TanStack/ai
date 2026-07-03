import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { ChatRequest$outboundSchema } from '@openrouter/sdk/models'
import { createOpenRouterText } from '../src/adapters/text'
import type { StreamChunk, Tool } from '@tanstack/ai'

/**
 * Wire-format verification for function-tool `cacheControl` forwarding.
 *
 * The adapter hands a `ChatRequest` to the SDK, which runs it through
 * `ChatRequest$outboundSchema` (a Zod serializer) before sending bytes
 * upstream. The SDK accepts `cacheControl` (camelCase) on a function tool and
 * remaps it to `cache_control` on the wire — but a key it doesn't recognise is
 * silently stripped. These tests replay the adapter's request through that same
 * outbound schema to assert that a caller-supplied `metadata.cacheControl`
 * actually reaches OpenRouter, enabling Anthropic prompt caching of tool
 * definitions (matching `@tanstack/ai-anthropic`'s custom-tool behaviour).
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

async function captureSerializedTool(tool: Tool): Promise<any> {
  setupMockSend()
  const adapter = createOpenRouterText('openai/gpt-4o-mini', 'test-key')
  const chunks: Array<StreamChunk> = []
  for await (const c of chat({
    adapter,
    messages: [{ role: 'user', content: 'hi' }],
    tools: [tool as never],
  })) {
    chunks.push(c)
  }
  const [rawParams] = mockSend.mock.calls[0]!
  const serialized = ChatRequest$outboundSchema.parse(
    rawParams.chatRequest,
  ) as { tools?: Array<any> }
  return serialized.tools?.[0]
}

const baseTool: Tool = {
  name: 'shared_context',
  description: 'Standing constraints carried as a cacheable tool.',
  inputSchema: { type: 'object', properties: {}, required: [] },
}

describe('OpenRouter function-tool cacheControl (post-SDK serialization)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards metadata.cacheControl as `cache_control` on the wire', async () => {
    const wireTool = await captureSerializedTool({
      ...baseTool,
      metadata: { cacheControl: { type: 'ephemeral' } },
    })
    expect(wireTool).toMatchObject({
      type: 'function',
      function: { name: 'shared_context' },
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

  it('omits cache_control entirely when no cacheControl metadata is supplied', async () => {
    const wireTool = await captureSerializedTool(baseTool)
    expect(wireTool).toMatchObject({
      type: 'function',
      function: { name: 'shared_context' },
    })
    expect(wireTool).not.toHaveProperty('cache_control')
  })
})
