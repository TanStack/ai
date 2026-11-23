import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpTokenSet } from '../src/oauth-redirect'

type AuthProvider = {
  saveClientInformation: (info: { client_id: string }) => void
  saveTokens: (tokens: {
    access_token: string
    token_type: string
  }) => Promise<void>
  tokens: () => Promise<
    | {
        access_token: string
        token_type: string
      }
    | undefined
  >
}

const createMCPClient = vi.fn()
let lastProvider: AuthProvider | undefined

vi.mock('@modelcontextprotocol/client', () => {
  class StreamableHTTPClientTransport {
    authProvider: AuthProvider

    constructor(_url: URL, opts: { authProvider: AuthProvider }) {
      this.authProvider = opts.authProvider
      lastProvider = opts.authProvider
    }

    async finishAuth() {
      this.authProvider.saveClientInformation({ client_id: 'client-1' })
      await this.authProvider.saveTokens({
        access_token: 'issued-token',
        token_type: 'Bearer',
      })
    }
  }

  return { StreamableHTTPClientTransport }
})

vi.mock('../src/client', () => ({
  createMCPClient: (...args: Array<unknown>) => createMCPClient(...args),
}))

describe('finishMCPOAuthRedirect', () => {
  beforeEach(() => {
    createMCPClient.mockReset()
    lastProvider = undefined
  })

  it('exposes the issued bearer token to the post-callback connection', async () => {
    const { finishMCPOAuthRedirect } = await import('../src/oauth-redirect')

    let stored: McpTokenSet | undefined
    const tokenStore = {
      load: async () => stored,
      save: async (tokens: McpTokenSet) => {
        stored = tokens
      },
      clear: async () => {
        stored = undefined
      },
      loadPending: async () => ({
        codeVerifier: 'verifier',
        client: { clientId: 'client-1' },
      }),
      savePending: async () => {},
      clearPending: async () => {},
    }

    createMCPClient.mockImplementation(async () => {
      const tokens = await lastProvider!.tokens()
      return { tokens }
    })

    const client = await finishMCPOAuthRedirect({
      url: 'https://mcp.example/mcp',
      callbackUrl: 'https://app.example/callback',
      tokenStore,
      code: 'auth-code',
    })

    expect(stored?.accessToken).toBe('issued-token')
    expect(client).toEqual({
      tokens: { access_token: 'issued-token', token_type: 'Bearer' },
    })
  })
})
