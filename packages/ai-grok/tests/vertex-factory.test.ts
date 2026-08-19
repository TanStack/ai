import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  GROK_VERTEX_CHAT_MODELS,
  grokVertexSummarize,
  grokVertexText,
} from '../src/vertex'

const testLogger = resolveDebugOption(false)

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

describe('GROK_VERTEX_CHAT_MODELS', () => {
  it('matches the Google Vertex Grok catalog', () => {
    expect(GROK_VERTEX_CHAT_MODELS).toEqual([
      'grok-4.3',
      'grok-4.20-reasoning',
      'grok-4.20-non-reasoning',
      'grok-4.1-fast-reasoning',
      'grok-4.1-fast-non-reasoning',
    ])
    expect(GROK_VERTEX_CHAT_MODELS).not.toContain('grok-4.6')
    expect(GROK_VERTEX_CHAT_MODELS).not.toContain('grok-4.5')
    expect(GROK_VERTEX_CHAT_MODELS).not.toContain('grok-build-0.1')
  })
})

describe('grokVertexText', () => {
  it('returns a Grok adapter for a Vertex project and location', () => {
    const adapter = grokVertexText('grok-4.3', {
      project: 'my-project',
      location: 'global',
      getAccessToken: async () => 'e2e-dummy',
    })

    expect(adapter.name).toBe('grok')
    expect(adapter.model).toBe('grok-4.3')
  })

  it('sends the Vertex xai/ model id on the Responses request', async () => {
    const adapter = grokVertexText('grok-4.3', {
      project: 'my-project',
      location: 'global',
      getAccessToken: async () => 'e2e-dummy',
    })

    const mockCreate = vi.fn().mockResolvedValue(
      createAsyncIterable([
        {
          type: 'response.created',
          response: { id: 'resp_123', model: 'xai/grok-4.3' },
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp_123',
            model: 'xai/grok-4.3',
            output: [],
          },
        },
      ]),
    )
    ;(adapter as any).client = {
      responses: {
        create: mockCreate,
      },
    }

    for await (const _chunk of adapter.chatStream({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: 'Hello' }],
      logger: testLogger,
    })) {
      // Exhaust the stream so the adapter sends the request.
    }

    expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
      model: 'xai/grok-4.3',
      stream: true,
    })
  })
})

describe('grokVertexSummarize', () => {
  it('returns a Grok summarize adapter', () => {
    const adapter = grokVertexSummarize('grok-4.3', {
      project: 'my-project',
      location: 'global',
      getAccessToken: async () => 'e2e-dummy',
    })

    expect(adapter.name).toBe('grok')
    expect(adapter.model).toBe('grok-4.3')
  })
})
