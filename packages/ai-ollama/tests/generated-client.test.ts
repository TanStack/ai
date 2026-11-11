import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOllamaChat } from '../src/adapters/text'
import { createOllamaFetchClient } from '../src/utils'
import { ollamaPostApiEmbed } from '../src/generated/client/sdk'

const model = 'llama3.2'

type Call = [input: RequestInfo | URL, init?: RequestInit]

describe('generated Ollama client', () => {
  it('streams a chat over NDJSON from the generated path', async () => {
    const ndjson = [
      { model, message: { role: 'assistant', content: 'Hel' }, done: false },
      { model, message: { role: 'assistant', content: 'lo' }, done: false },
      { model, message: { role: 'assistant', content: '' }, done: true },
    ]
      .map((chunk) => `${JSON.stringify(chunk)}\n`)
      .join('')
    const fetcher = vi
      .fn<(...args: Call) => Promise<Response>>()
      .mockResolvedValue(
        new Response(ndjson, {
          headers: { 'content-type': 'application/x-ndjson' },
        }),
      )
    const adapter = createOllamaChat(model, {
      host: '127.0.0.1',
      headers: { 'X-Gateway': 'yes' },
    })
    let text = ''
    for await (const chunk of adapter.chatStream({
      threadId: 'thread-1',
      logger: resolveDebugOption(false),
      model,
      messages: [{ role: 'user', content: 'hi' }],
      // The injected HTTP seam: the request never reaches `next`.
      wrapFetch: () => fetcher,
    })) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
    }

    const [url, init] = fetcher.mock.calls[0]!
    // The SDK host format: a bare host gets `http://` and the Ollama port.
    expect(url).toBe('http://127.0.0.1:11434/api/chat')
    expect(init?.method).toBe('POST')
    const headers = new Headers(init?.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('accept')).toBe('application/json')
    expect(headers.get('x-gateway')).toBe('yes')
    expect(JSON.parse(String(init?.body))).toEqual({
      model,
      messages: [{ role: 'user', content: 'hi' }],
      options: {},
      stream: true,
    })
    expect(text).toBe('Hello')
  })

  it('sends an embed request and throws the SDK error message', async () => {
    const fetcher = vi
      .fn<(...args: Call) => Promise<Response>>()
      .mockResolvedValueOnce(Response.json({ model, embeddings: [[0.1, 0.2]] }))
      .mockResolvedValueOnce(
        Response.json({ error: 'model not found' }, { status: 404 }),
      )
    const client = createOllamaFetchClient(
      { baseURL: 'https://gw.example/ollama/' },
      fetcher,
    )
    const body = { model, input: ['a red guitar'] }

    const { response } = await ollamaPostApiEmbed({ client, body })
    expect(await response.json()).toEqual({ model, embeddings: [[0.1, 0.2]] })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://gw.example:443/ollama/api/embed')
    expect(JSON.parse(String(init?.body))).toEqual(body)

    await expect(ollamaPostApiEmbed({ client, body })).rejects.toMatchObject({
      name: 'ResponseError',
      message: 'model not found',
      status_code: 404,
    })
  })
})
