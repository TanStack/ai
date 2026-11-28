import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpTokenSet } from '../src/oauth-redirect'

type AuthProvider = {
  clientInformation: () => Promise<
    | {
        client_id: string
        client_secret?: string
        issuer?: string
      }
    | undefined
  >
}

const createMCPClient = vi.fn()

vi.mock('../src/client', () => ({
  createMCPClient: (...args: Array<unknown>) => createMCPClient(...args),
}))

describe('createMCPClientWithOAuthRedirect reconnect', () => {
  beforeEach(() => {
    createMCPClient.mockReset()
  })

  it('does not replace saved.client with leftover pending PKCE client data', async () => {
    const { createMCPClientWithOAuthRedirect } = await import(
      '../src/oauth-redirect'
    )

    const tokenStore = {
      load: async (): Promise<McpTokenSet | undefined> => ({
        accessToken: 'saved-token',
        client: { clientId: 'saved-client' },
      }),
      save: async () => {},
      clear: async () => {},
      loadPending: async () => ({
        codeVerifier: 'leftover-verifier',
        client: { clientId: 'pending-client' },
      }),
      savePending: async () => {},
      clearPending: async () => {},
    }

    createMCPClient.mockImplementation(
      async (opts: { transport: { authProvider: AuthProvider } }) => {
        const info = await opts.transport.authProvider.clientInformation()
        return { info }
      },
    )

    const result = await createMCPClientWithOAuthRedirect({
      url: 'https://mcp.example/mcp',
      callbackUrl: 'https://app.example/callback',
      tokenStore,
    })

    expect(result.status).toBe('connected')
    if (result.status !== 'connected') return
    expect(result.client).toEqual({
      info: { client_id: 'saved-client' },
    })
  })
})
