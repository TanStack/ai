import { describe, expect, it } from 'vitest'
import { createOpenAIClient } from '../src/client'

// The chat calls go through the generated `POST /chat/completions` operation.
function recordingFetch(response: () => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return await Promise.resolve(response())
  }
  return { calls, fetch }
}

const body = {
  model: 'gpt-5.5',
  messages: [{ role: 'user' as const, content: 'Hi' }],
}

describe('generated OpenAI client', () => {
  it('sends a JSON chat completion and parses the body', async () => {
    const { calls, fetch } = recordingFetch(() =>
      Response.json({ id: 'c1', object: 'chat.completion', choices: [] }),
    )
    const client = createOpenAIClient({ apiKey: 'sk-test', fetch })

    const result = await client.chat.completions.create(body)

    expect(result).toMatchObject({ id: 'c1' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(calls[0]?.init.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual(body)
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('authorization')).toBe('Bearer sk-test')
  })

  it('streams a chat completion as parsed SSE chunks', async () => {
    const sse = [
      'data: {"id":"c1","choices":[{"index":0,"delta":{"content":"He"}}]}',
      'data: {"id":"c1","choices":[{"index":0,"delta":{"content":"llo"}}]}',
      'data: [DONE]',
      '',
    ].join('\n\n')
    const { calls, fetch } = recordingFetch(
      () =>
        new Response(sse, { headers: { 'content-type': 'text/event-stream' } }),
    )
    const client = createOpenAIClient({ apiKey: 'sk-test', fetch })

    const stream = await client.chat.completions.create({
      ...body,
      stream: true,
    })
    const text: Array<string> = []
    for await (const chunk of stream) {
      text.push(chunk.choices[0]?.delta.content ?? '')
      // A missing finish_reason becomes null, like the SDK.
      expect(chunk.choices[0]?.finish_reason).toBeNull()
    }

    expect(text.join('')).toBe('Hello')
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      stream: true,
    })
  })
})
