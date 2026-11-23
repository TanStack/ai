import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type {
  OAuthClientProvider,
  OAuthTokens,
  StoredOAuthClientInformation,
} from '@modelcontextprotocol/client'
import { createMCPClient } from './client'
import type { MCPClient } from './client'
import type { MCPClientOptions } from './types'

export type McpTokenSet = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  scope?: string
  client?: {
    clientId: string
    clientSecret?: string
    issuer?: string
  }
}

/** PKCE + client registration saved between redirect and callback. */
export type McpOAuthPending = {
  codeVerifier: string
  client?: {
    clientId: string
    clientSecret?: string
    issuer?: string
  }
}

export type McpTokenStore = {
  load: () => Promise<McpTokenSet | undefined>
  save: (tokens: McpTokenSet) => Promise<void>
  clear: () => Promise<void>
  /** Optional but required for a multi-request redirect flow. */
  loadPending?: () => Promise<McpOAuthPending | undefined>
  savePending?: (pending: McpOAuthPending) => Promise<void>
  clearPending?: () => Promise<void>
}

export type CreateMCPClientWithOAuthRedirectOptions = {
  /** Streamable HTTP MCP server URL. */
  url: string
  /** Must match the redirect URI registered with the authorization server. */
  callbackUrl: string
  tokenStore: McpTokenStore
  /** Shown on the consent screen. Default `'TanStack AI'`. */
  clientName?: string
  /** OAuth scopes. Default: whatever the server offers. */
  scopes?: ReadonlyArray<string>
  /** Extra MCP client options (prefix, toolFilter, …). `transport` is set by this helper. */
  client?: Omit<MCPClientOptions, 'transport'>
  fetch?: typeof fetch
}

export type MCPClientWithOAuthResult =
  | { status: 'connected'; client: MCPClient }
  | { status: 'redirect'; authorizationUrl: string }

async function tokenStoreProvider(
  options: {
    redirectUri: string
    clientName: string
    scopes: ReadonlyArray<string> | undefined
    tokenStore: McpTokenStore
  },
  hooks: {
    onRedirect?: (url: URL) => void
  },
): Promise<OAuthClientProvider> {
  let client: StoredOAuthClientInformation | undefined
  let verifier = ''
  const pending = await options.tokenStore.loadPending?.()
  if (pending?.codeVerifier) verifier = pending.codeVerifier
  if (pending?.client) {
    client = {
      client_id: pending.client.clientId,
      ...(pending.client.clientSecret
        ? { client_secret: pending.client.clientSecret }
        : {}),
      ...(pending.client.issuer ? { issuer: pending.client.issuer } : {}),
    }
  }
  return {
    get redirectUrl() {
      return options.redirectUri
    },
    get clientMetadata() {
      return {
        client_name: options.clientName,
        redirect_uris: [options.redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        ...(options.scopes?.length
          ? { scope: options.scopes.join(' ') }
          : {}),
      }
    },
    clientInformation: async () => {
      if (client) return client
      const pending = await options.tokenStore.loadPending?.()
      if (pending?.client) {
        client = {
          client_id: pending.client.clientId,
          ...(pending.client.clientSecret
            ? { client_secret: pending.client.clientSecret }
            : {}),
          ...(pending.client.issuer ? { issuer: pending.client.issuer } : {}),
        }
        return client
      }
      const saved = await options.tokenStore.load()
      if (!saved?.client) return undefined
      client = {
        client_id: saved.client.clientId,
        ...(saved.client.clientSecret
          ? { client_secret: saved.client.clientSecret }
          : {}),
        ...(saved.client.issuer ? { issuer: saved.client.issuer } : {}),
      }
      return client
    },
    saveClientInformation: (information) => {
      client = information
    },
    tokens: async () => {
      if (hooks.onRedirect) return undefined
      const saved = await options.tokenStore.load()
      if (!saved) return undefined
      return {
        access_token: saved.accessToken,
        token_type: 'Bearer',
        ...(saved.refreshToken ? { refresh_token: saved.refreshToken } : {}),
        ...(saved.expiresAt
          ? {
              expires_in: Math.max(
                0,
                Math.floor((saved.expiresAt - Date.now()) / 1000),
              ),
            }
          : {}),
        ...(saved.client?.issuer ? { issuer: saved.client.issuer } : {}),
      } satisfies OAuthTokens
    },
    saveTokens: async (tokens) => {
      const information = client
      if (!information) {
        throw new Error('The MCP SDK saved OAuth tokens before the client.')
      }
      await options.tokenStore.save({
        accessToken: tokens.access_token,
        ...(tokens.refresh_token
          ? { refreshToken: tokens.refresh_token }
          : {}),
        ...(tokens.expires_in
          ? { expiresAt: Date.now() + tokens.expires_in * 1000 }
          : {}),
        ...(tokens.scope ? { scope: tokens.scope } : {}),
        client: {
          clientId: information.client_id,
          ...(information.client_secret
            ? { clientSecret: information.client_secret }
            : {}),
          ...(information.issuer ? { issuer: information.issuer } : {}),
        },
      })
      await options.tokenStore.clearPending?.()
    },
    invalidateCredentials: async () => {
      await options.tokenStore.clear()
      client = undefined
    },
    redirectToAuthorization: (url) => {
      if (!hooks.onRedirect) {
        throw new Error(
          'MCP OAuth requires a browser redirect, but no redirect handler is set.',
        )
      }
      hooks.onRedirect(url)
    },
    saveCodeVerifier: (value) => {
      verifier = value
    },
    codeVerifier: () => verifier,
  }
}

async function persistPending(
  tokenStore: McpTokenStore,
  provider: OAuthClientProvider,
): Promise<void> {
  if (!tokenStore.savePending) {
    throw new Error(
      'tokenStore.savePending is required for the OAuth redirect flow across requests',
    )
  }
  const verifier =
    typeof provider.codeVerifier === 'function' ? provider.codeVerifier() : ''
  const information = await provider.clientInformation?.()
  await tokenStore.savePending({
    codeVerifier: typeof verifier === 'string' ? verifier : await verifier,
    ...(information
      ? {
          client: {
            clientId: information.client_id,
            ...(information.client_secret
              ? { clientSecret: information.client_secret }
              : {}),
            ...(information.issuer ? { issuer: information.issuer } : {}),
          },
        }
      : {}),
  })
}

/**
 * Connect to an OAuth-protected MCP server.
 *
 * - When tokens are already in `tokenStore`, returns `{ status: 'connected' }`.
 * - Otherwise returns `{ status: 'redirect', authorizationUrl }` — send the
 *   user there, then call {@link finishMCPOAuthRedirect} with the `code`.
 *
 * For a redirect that spans HTTP requests, `tokenStore` must implement
 * `loadPending` / `savePending` / `clearPending`.
 */
export async function createMCPClientWithOAuthRedirect(
  options: CreateMCPClientWithOAuthRedirectOptions,
): Promise<MCPClientWithOAuthResult> {
  const saved = await options.tokenStore.load()
  if (saved?.accessToken) {
    const provider = await tokenStoreProvider(
      {
        redirectUri: options.callbackUrl,
        clientName: options.clientName ?? 'TanStack AI',
        scopes: options.scopes,
        tokenStore: options.tokenStore,
      },
      {},
    )
    const client = await createMCPClient({
      ...options.client,
      transport: {
        type: 'http',
        url: options.url,
        authProvider: provider,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      },
    })
    return { status: 'connected', client }
  }

  let authorizationUrl: string | undefined
  const provider = await tokenStoreProvider(
    {
      redirectUri: options.callbackUrl,
      clientName: options.clientName ?? 'TanStack AI',
      scopes: options.scopes,
      tokenStore: options.tokenStore,
    },
    {
      onRedirect: (url) => {
        authorizationUrl = url.href
      },
    },
  )
  try {
    await createMCPClient({
      ...options.client,
      transport: {
        type: 'http',
        url: options.url,
        authProvider: provider,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      },
    })
  } catch {
    // Expected when auth redirects before the session opens.
  }
  if (!authorizationUrl) {
    throw new Error(
      'MCP OAuth did not produce an authorization URL. Check callbackUrl and the server metadata.',
    )
  }
  await persistPending(options.tokenStore, provider)
  return { status: 'redirect', authorizationUrl }
}

/**
 * Finish an OAuth redirect: exchange `code`, save tokens, return a connected
 * MCP client. Call this from your callback route.
 */
export async function finishMCPOAuthRedirect(
  options: CreateMCPClientWithOAuthRedirectOptions & { code: string },
): Promise<MCPClient> {
  const provider = await tokenStoreProvider(
    {
      redirectUri: options.callbackUrl,
      clientName: options.clientName ?? 'TanStack AI',
      scopes: options.scopes,
      tokenStore: options.tokenStore,
    },
    {},
  )
  const transport = new StreamableHTTPClientTransport(new URL(options.url), {
    authProvider: provider,
    fetch: options.fetch,
  })
  await transport.finishAuth(options.code)
  return createMCPClient({
    ...options.client,
    transport,
  })
}

/**
 * Build a {@link McpTokenStore} scoped to one user + server id.
 * Back it with your DB / KV via `backend`.
 */
export function createUserMcpTokenStore(options: {
  userId: string
  serverId: string
  backend: {
    get: (
      userId: string,
      serverId: string,
    ) => Promise<McpTokenSet | undefined>
    set: (
      userId: string,
      serverId: string,
      tokens: McpTokenSet,
    ) => Promise<void>
    delete: (userId: string, serverId: string) => Promise<void>
    getPending?: (
      userId: string,
      serverId: string,
    ) => Promise<McpOAuthPending | undefined>
    setPending?: (
      userId: string,
      serverId: string,
      pending: McpOAuthPending,
    ) => Promise<void>
    deletePending?: (userId: string, serverId: string) => Promise<void>
  }
}): McpTokenStore {
  const { userId, serverId, backend } = options
  return {
    load: () => backend.get(userId, serverId),
    save: (tokens) => backend.set(userId, serverId, tokens),
    clear: () => backend.delete(userId, serverId),
    loadPending: backend.getPending
      ? () => backend.getPending!(userId, serverId)
      : undefined,
    savePending: backend.setPending
      ? (pending) => backend.setPending!(userId, serverId, pending)
      : undefined,
    clearPending: backend.deletePending
      ? () => backend.deletePending!(userId, serverId)
      : undefined,
  }
}
