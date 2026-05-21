import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { ChatRequest$outboundSchema } from '@openrouter/sdk/models'
import { createOpenRouterText } from '../src/adapters/text'
import { webSearchTool } from '../src/tools/web-search-tool'
import { webFetchTool } from '../src/tools/web-fetch-tool'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Wire-format verification for OpenRouter's server-side web tools.
 *
 * The adapter doesn't hit OpenRouter directly — it hands a `ChatRequest` to
 * the SDK, which runs it through `ChatRequest$outboundSchema` (a Zod
 * serializer) before sending the bytes upstream. These tests assert what
 * actually goes over the wire by replaying the adapter's request through that
 * same outbound schema.
 *
 * Earlier versions of this package shipped a non-SDK shape (`{type:
 * 'web_search', web_search: {...}}` / `{type: 'web_fetch', web_fetch:
 * {...}}`) that compiled cleanly but had the inner sub-object silently
 * stripped by the SDK's outbound serializer — so caller-passed `engine`,
 * `maxResults`, `maxContentTokens`, etc. never reached OpenRouter. The tests
 * below pin the fix: both factories now emit `{type:
 * 'openrouter:web_*', parameters: {...}}` (the canonical
 * `OpenRouterWebSearchServerTool` / `WebFetchServerTool` shapes from
 * `@openrouter/sdk`), and parameters survive serialization.
 */

let mockSend: any

// eslint-disable-next-line @typescript-eslint/require-await
vi.mock('@openrouter/sdk', async () => {
  function OpenRouter(
    this: { chat: { send: (...args: Array<unknown>) => unknown } },
  ) {
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

async function captureSerializedTools(tool: unknown): Promise<unknown> {
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
  ) as { tools?: Array<unknown> }
  return serialized.tools?.[0]
}

describe('OpenRouter web-tool wire format (post-SDK serialization)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('webSearchTool() preserves the full parameters object on the wire', async () => {
    const wireTool = await captureSerializedTools(
      webSearchTool({
        engine: 'exa',
        maxResults: 10,
        searchContextSize: 'medium',
        allowedDomains: ['example.com'],
        excludedDomains: ['evil.example'],
      }),
    )
    expect(wireTool).toMatchObject({
      type: 'openrouter:web_search',
      parameters: {
        engine: 'exa',
        max_results: 10,
        search_context_size: 'medium',
        allowed_domains: ['example.com'],
        excluded_domains: ['evil.example'],
      },
    })
  })

  it('webFetchTool() preserves the full parameters object on the wire', async () => {
    const wireTool = await captureSerializedTools(
      webFetchTool({
        engine: 'openrouter',
        maxContentTokens: 4000,
        allowedDomains: ['example.com'],
        blockedDomains: ['evil.example'],
        maxUses: 3,
      }),
    )
    expect(wireTool).toMatchObject({
      type: 'openrouter:web_fetch',
      parameters: {
        engine: 'openrouter',
        max_content_tokens: 4000,
        allowed_domains: ['example.com'],
        blocked_domains: ['evil.example'],
        max_uses: 3,
      },
    })
  })

  it('omits parameters entirely when neither factory was given options', async () => {
    const searchTool = await captureSerializedTools(webSearchTool())
    const fetchTool = await captureSerializedTools(webFetchTool())
    expect(searchTool).toEqual({ type: 'openrouter:web_search' })
    expect(fetchTool).toEqual({ type: 'openrouter:web_fetch' })
  })
})
