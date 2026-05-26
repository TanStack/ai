import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPerplexityChatClient } from '../src/chat/client'

const INTEGRATION_HEADER = 'X-Pplx-Integration'

function getHeader(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null
  if (headers instanceof Headers) return headers.get(name)

  const record = Array.isArray(headers)
    ? Object.fromEntries(headers)
    : headers

  const matchingKey = Object.keys(record).find(
    (key) => key.toLowerCase() === name.toLowerCase(),
  )
  return matchingKey ? record[matchingKey] ?? null : null
}

describe('createPerplexityChatClient', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    process.env.PERPLEXITY_API_KEY = 'test-key'
    delete process.env.PPLX_API_KEY
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
  })

  it('constructs an OpenAI-compatible client pointed at api.perplexity.ai by default', () => {
    const client = createPerplexityChatClient()
    expect(String(client.baseURL)).toContain('api.perplexity.ai')
    expect(client.apiKey).toBe('test-key')
  })

  it('sends the attribution header on chat requests', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: 0,
            model: 'sonar',
            choices: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    const client = createPerplexityChatClient({ fetch: fetchMock as any })

    await client.chat.completions.create({
      model: 'sonar',
      messages: [{ role: 'user', content: 'hello' }],
    })

    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(getHeader(init.headers, INTEGRATION_HEADER)).toMatch(/^tanstack\//)
  })

  it('uses an explicit apiKey over the env var', () => {
    const client = createPerplexityChatClient({ apiKey: 'explicit' })
    expect(client.apiKey).toBe('explicit')
  })

  it('falls back to env when explicit apiKey is blank', () => {
    const client = createPerplexityChatClient({ apiKey: '   ' })
    expect(client.apiKey).toBe('test-key')
  })

  it('falls back to PPLX_API_KEY when PERPLEXITY_API_KEY is not set', () => {
    delete process.env.PERPLEXITY_API_KEY
    process.env.PPLX_API_KEY = 'fallback'
    const client = createPerplexityChatClient()
    expect(client.apiKey).toBe('fallback')
  })

  it('respects a baseURL override', () => {
    const client = createPerplexityChatClient({
      apiKey: 'k',
      baseURL: 'https://example.com/v1',
    })
    expect(String(client.baseURL)).toContain('example.com')
  })

  it('throws when no API key is available', () => {
    delete process.env.PERPLEXITY_API_KEY
    delete process.env.PPLX_API_KEY
    expect(() => createPerplexityChatClient()).toThrow(/PERPLEXITY_API_KEY/)
  })
})
