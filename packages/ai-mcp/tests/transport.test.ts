import { describe, expect, it } from 'vitest'
import { resolveTransport } from '../src/transport'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'

const fakeAuthProvider: OAuthClientProvider = {
  redirectUrl: 'https://app.example.com/oauth/callback',
  clientMetadata: { redirect_uris: ['https://app.example.com/oauth/callback'] },
  clientInformation: () => undefined,
  tokens: () => undefined,
  saveTokens: () => {},
  redirectToAuthorization: () => {},
  saveCodeVerifier: () => {},
  codeVerifier: () => 'verifier',
}

describe('resolveTransport', () => {
  it('builds a Streamable HTTP transport from config', async () => {
    const t = await resolveTransport({
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer x' },
    })
    expect(t).toBeDefined()
    expect(t.constructor.name).toMatch(/StreamableHTTP/)
  })

  it('forwards authProvider to the HTTP and SSE transports', async () => {
    const http = await resolveTransport({
      type: 'http',
      url: 'https://example.com/mcp',
      authProvider: fakeAuthProvider,
    })
    const sse = await resolveTransport({
      type: 'sse',
      url: 'https://example.com/sse',
      authProvider: fakeAuthProvider,
    })
    // The SDK transports keep the provider in a private `_authProvider`
    // field (no public getter). Pinning it here guards the option actually
    // being forwarded; the field name is stable for the pinned SDK version.
    expect(Reflect.get(http, '_authProvider')).toBe(fakeAuthProvider)
    expect(Reflect.get(sse, '_authProvider')).toBe(fakeAuthProvider)
  })

  it('passes through a user-supplied transport instance', async () => {
    const fake = {
      start: async () => {},
      send: async () => {},
      close: async () => {},
    }
    const t = await resolveTransport(fake as any)
    expect(t).toBe(fake)
  })

  it('throws a clear error for stdio without the /stdio import', async () => {
    await expect(
      resolveTransport({ type: 'stdio', command: 'node', args: [] }),
    ).rejects.toThrow(/@tanstack\/ai-mcp\/stdio/)
  })
})
