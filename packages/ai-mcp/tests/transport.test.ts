import { describe, expect, it } from 'vitest'
import { resolveTransport } from '../src/transport'
import type {
  OAuthClientProvider,
  Transport,
} from '@modelcontextprotocol/client'

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

function expectRequestHeaders(
  transport: Transport,
  headers: Record<string, string>,
) {
  expect(Reflect.get(transport, '_requestInit')).toEqual({ headers })
}

describe('resolveTransport', () => {
  it('builds a Streamable HTTP transport from config', async () => {
    const headers = { Authorization: 'Bearer x' }
    const t = await resolveTransport({
      type: 'http',
      url: 'https://example.com/mcp',
      headers,
    })
    expect(t).toBeDefined()
    expect(t.constructor.name).toMatch(/StreamableHTTP/)
    expectRequestHeaders(t, headers)
  })

  it('builds an SSE transport from config', async () => {
    const headers = { Authorization: 'Bearer y' }
    const t = await resolveTransport({
      type: 'sse',
      url: 'https://example.com/sse',
      headers,
    })
    expect(t.constructor.name).toMatch(/SSEClient/)
    expectRequestHeaders(t, headers)
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
    // The client keeps an OAuthClientProvider on `_oauthProvider`.
    // There is no public getter. This pins the forwarded option.
    expect(Reflect.get(http, '_oauthProvider')).toBe(fakeAuthProvider)
    expect(Reflect.get(sse, '_oauthProvider')).toBe(fakeAuthProvider)
  })

  it('passes through a user-supplied transport instance', async () => {
    const fake: Transport = {
      start: async () => {},
      send: async () => {},
      close: async () => {},
    }
    const t = await resolveTransport(fake)
    expect(t).toBe(fake)
  })

  it('throws a clear error for stdio without the /stdio import', async () => {
    await expect(
      resolveTransport({ type: 'stdio', command: 'node', args: [] }),
    ).rejects.toThrow(/@tanstack\/ai-mcp\/stdio/)
  })
})
