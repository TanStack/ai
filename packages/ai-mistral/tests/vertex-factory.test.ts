import { afterEach, describe, expect, it, vi } from 'vitest'
import { MISTRAL_VERTEX_CHAT_MODELS, mistralVertexText } from '../src/vertex'
import type { TextOptions } from '@tanstack/ai'
import type { MistralTextProviderOptions } from '../src/adapters/text'

function chatOpts(
  opts: Partial<TextOptions<MistralTextProviderOptions>> & {
    model: string
    messages: Array<{ role: 'user'; content: string }>
  },
): TextOptions<MistralTextProviderOptions> {
  return opts as unknown as TextOptions<MistralTextProviderOptions>
}

describe('MISTRAL_VERTEX_CHAT_MODELS', () => {
  it('matches the Google Vertex Mistral chat catalog', () => {
    expect(MISTRAL_VERTEX_CHAT_MODELS).toEqual([
      'mistral-medium-3',
      'mistral-small-2503',
      'codestral-2',
    ])
    expect(MISTRAL_VERTEX_CHAT_MODELS).not.toContain('mistral-large-latest')
    expect(MISTRAL_VERTEX_CHAT_MODELS).not.toContain('mistral-medium-latest')
    expect(MISTRAL_VERTEX_CHAT_MODELS).not.toContain('magistral-medium-latest')
  })
})

describe('mistralVertexText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a Mistral adapter for a Vertex project and location', () => {
    const adapter = mistralVertexText('mistral-medium-3', {
      project: 'my-project',
      location: 'us-central1',
      getAccessToken: async () => 'e2e-dummy',
    })

    expect(adapter.name).toBe('mistral')
    expect(adapter.model).toBe('mistral-medium-3')
  })

  it('does not require project when resolveRequestUrl is set', () => {
    expect(() =>
      mistralVertexText('mistral-medium-3', {
        resolveRequestUrl: () => 'http://127.0.0.1:4010/v1/chat/completions',
        getAccessToken: async () => 'e2e-dummy',
      }),
    ).not.toThrow()
  })

  it('posts to streamRawPredict with the Vertex wire model', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('data: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const adapter = mistralVertexText('mistral-medium-3', {
      project: 'my-project',
      location: 'europe-west4',
      getAccessToken: async () => 'vertex-token',
    })

    for await (const _chunk of adapter.chatStream(
      chatOpts({
        model: 'mistral-medium-3',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    )) {
      // Exhaust the stream so the adapter sends the request.
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ]
    expect(url).toBe(
      'https://europe-west4-aiplatform.googleapis.com/v1/projects/my-project/locations/europe-west4/publishers/mistralai/models/mistral-medium-3:streamRawPredict',
    )
    expect(init.headers.Authorization).toBe('Bearer vertex-token')
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'mistral-medium-3',
      stream: true,
    })
  })
})
