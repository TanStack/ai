import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  GROK_VERTEX_CHAT_MODELS,
  grokVertexSummarize,
  grokVertexText,
} from '../src/vertex'

const testLogger = resolveDebugOption(false)

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

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a Bearer token and the Vertex xai/ model id', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('data: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const adapter = grokVertexText('grok-4.3', {
      baseURL: 'http://vertex.test/v1',
      getAccessToken: async () => 'vertex-token',
    })

    try {
      for await (const _chunk of adapter.chatStream({
        model: 'grok-4.3',
        messages: [{ role: 'user', content: 'Hello' }],
        logger: testLogger,
      })) {
        // Exhaust the stream so the adapter sends the request.
      }
    } catch {
      // The fixture is only a DONE event. The request still went out.
    }

    expect(fetchSpy).toHaveBeenCalled()
    const [url, init] = fetchSpy.mock.calls[0] as [
      string | URL | Request,
      { headers?: HeadersInit; body?: string },
    ]
    expect(String(url)).toContain('http://vertex.test/v1/responses')
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer vertex-token',
    )
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'xai/grok-4.3',
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
