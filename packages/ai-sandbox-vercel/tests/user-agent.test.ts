import { describe, expect, it, vi } from 'vitest'
import { USER_AGENT_TOKEN, withSandboxUserAgent } from '../src/user-agent'

function userAgentOf(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('user-agent')
}

describe('withSandboxUserAgent', () => {
  it('appends the token to an existing user-agent (as the SDK sends)', async () => {
    const inner = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response())
    const wrapped = withSandboxUserAgent(inner)

    await wrapped('https://api.vercel.com/v2/sandboxes', {
      headers: { 'user-agent': 'vercel/sandbox/2.2.1' },
    })

    const [, init] = inner.mock.calls[0]!
    expect(userAgentOf(init)).toBe(`vercel/sandbox/2.2.1 ${USER_AGENT_TOKEN}`)
  })

  it('sets the token as the user-agent when none is present', async () => {
    const inner = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response())
    const wrapped = withSandboxUserAgent(inner)

    await wrapped('https://api.vercel.com/v2/sandboxes')

    const [, init] = inner.mock.calls[0]!
    expect(userAgentOf(init)).toBe(USER_AGENT_TOKEN)
  })

  it('preserves other request init fields (method, body, signal)', async () => {
    const inner = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response())
    const wrapped = withSandboxUserAgent(inner)
    const signal = new AbortController().signal

    await wrapped('https://api.vercel.com/v2/sandboxes', {
      method: 'POST',
      body: '{"ok":true}',
      signal,
    })

    const [, init] = inner.mock.calls[0]!
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{"ok":true}')
    expect(init?.signal).toBe(signal)
  })

  it('reads the user-agent off a Request input when no init is given', async () => {
    const inner = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response())
    const wrapped = withSandboxUserAgent(inner)

    await wrapped(
      new Request('https://api.vercel.com/v2/sandboxes', {
        headers: { 'user-agent': 'vercel/sandbox/2.2.1' },
      }),
    )

    const [, init] = inner.mock.calls[0]!
    expect(userAgentOf(init)).toBe(`vercel/sandbox/2.2.1 ${USER_AGENT_TOKEN}`)
  })

  it('defaults to globalThis.fetch when no inner fetch is supplied', () => {
    expect(typeof withSandboxUserAgent()).toBe('function')
  })
})
