import { describe, expect, it, vi } from 'vitest'
import { withSandboxUserAgent } from '../src/provider'

function userAgentOf(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('user-agent')
}

async function callWrapped(init?: RequestInit) {
  const inner = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response())
  await withSandboxUserAgent(inner)('https://api.vercel.com/v2/sandboxes', init)
  return inner.mock.calls[0]![1]
}

describe('withSandboxUserAgent', () => {
  it('appends the token to an existing user-agent', async () => {
    const init = await callWrapped({
      headers: { 'user-agent': 'vercel/sandbox/2.2.1' },
    })
    expect(userAgentOf(init)).toBe('vercel/sandbox/2.2.1 @tanstack/ai')
  })

  it('preserves other request init fields', async () => {
    const signal = new AbortController().signal
    const init = await callWrapped({
      method: 'POST',
      body: '{"ok":true}',
      signal,
    })
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{"ok":true}')
    expect(init?.signal).toBe(signal)
  })
})
