import { randomBytes } from 'node:crypto'
import { auth } from '@modelcontextprotocol/client'
import {
  AuthRequiredError,
  defineCommand,
  definePlugin,
  startLoopbackReceiver,
} from '@tanstack/ai-harness'
import { createMCPClient } from './client'
import { MCPConnectionError } from './errors'
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
} from '@modelcontextprotocol/client'
import type { AnyTool } from '@tanstack/ai'
import type { CredentialsAccess } from '@tanstack/ai-harness'
import type { MCPClient } from './client'

export interface McpConnectorOptions {
  /** A short id, for example `'notion'`. Commands are `connect:<id>` and `disconnect:<id>`. */
  id: string
  label: string
  /** The MCP server URL (Streamable HTTP), for example `https://mcp.notion.com/mcp`. */
  url: string
  /** Tool name prefix. Default: the id. Tools are named `<prefix>_<tool>`. */
  prefix?: string
  /** OAuth scopes to ask for. Default: what the server offers. */
  scopes?: ReadonlyArray<string>
  /** The client name shown on the consent screen. Default `'TanStack AI Harness'`. */
  clientName?: string
  /**
   * Ask for approval before tools that can change data. Default: every tool
   * the server does not mark `readOnlyHint`.
   */
  needsApproval?: (tool: {
    name: string
    annotations?: { readOnlyHint?: boolean }
  }) => boolean
  /** Test hook for the OAuth and MCP requests. */
  fetch?: typeof fetch
}

/**
 * An `OAuthClientProvider` for the MCP SDK that keeps tokens (and the client
 * that dynamic registration made) in the harness credential store.
 */
function credentialProvider(
  id: string,
  credentials: CredentialsAccess,
  options: {
    redirectUri: string
    clientName: string
    scopes: ReadonlyArray<string> | undefined
    state?: string
    onRedirect?: (url: URL) => void
  },
) {
  const { state } = options
  let client: StoredOAuthClientInformation | undefined
  let verifier = ''
  let discovery: OAuthDiscoveryState | undefined
  const stored = async () => {
    const credential = await credentials.get(id)
    return credential?.type === 'oauth' ? credential : undefined
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
        ...(options.scopes?.length ? { scope: options.scopes.join(' ') } : {}),
      }
    },
    ...(state ? { state: () => state } : {}),
    clientInformation: async () => {
      if (client) return client
      // A new sign-in registers a client for its own loopback port.
      if (options.onRedirect) return undefined
      const saved = (await stored())?.client
      if (!saved) return undefined
      // Kept, so the tokens saved after a refresh keep this client.
      client = {
        client_id: saved.clientId,
        ...(saved.clientSecret ? { client_secret: saved.clientSecret } : {}),
        ...(saved.issuer ? { issuer: saved.issuer } : {}),
      }
      return client
    },
    saveClientInformation: (information) => {
      client = information
    },
    tokens: async () => {
      if (options.onRedirect) return undefined
      const credential = await stored()
      if (!credential) return undefined
      return {
        access_token: credential.accessToken,
        token_type: 'Bearer',
        ...(credential.refreshToken
          ? { refresh_token: credential.refreshToken }
          : {}),
        ...(credential.expiresAt
          ? {
              expires_in: Math.max(
                0,
                Math.floor((credential.expiresAt - Date.now()) / 1000),
              ),
            }
          : {}),
        // The SDK checks that the tokens come from the same server (SEP-2352).
        ...(credential.client?.issuer
          ? { issuer: credential.client.issuer }
          : {}),
      }
    },
    saveTokens: async (tokens) => {
      const information = client
      // `auth()` reads or registers the client before it saves tokens.
      if (!information) {
        throw new Error('The MCP SDK saved OAuth tokens before the client.')
      }
      // A new sign-in replaces the old one, with all its tokens. On a
      // refresh, the SDK passes the old refresh token itself.
      await credentials.set(id, {
        type: 'oauth',
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        ...(tokens.expires_in
          ? { expiresAt: Date.now() + tokens.expires_in * 1000 }
          : {}),
        ...(tokens.scope ? { scopes: tokens.scope.split(' ') } : {}),
        client: {
          clientId: information.client_id,
          ...(information.client_secret
            ? { clientSecret: information.client_secret }
            : {}),
          redirectUri: options.redirectUri,
          issuer: information.issuer,
        },
      })
    },
    // The SDK calls this with 'client' or 'tokens' when the server refuses
    // the saved client or refresh token, for example a revoked refresh token.
    // Both are in one saved credential, so either scope deletes it, and the
    // user signs in again. A new sign-in keeps the old one until it works.
    invalidateCredentials: async () => {
      if (!options.onRedirect) await credentials.delete(id)
    },
    redirectToAuthorization: (url) => {
      // Outside `/connect`, a missing or revoked sign-in stops the tool.
      if (!options.onRedirect) throw new AuthRequiredError(id)
      options.onRedirect(url)
    },
    saveCodeVerifier: (value) => {
      verifier = value
    },
    codeVerifier: () => verifier,
    // Kept like the code verifier: `/connect` checks that the code comes
    // from the authorization server it found first (SEP-2352).
    saveDiscoveryState: (value) => {
      discovery = value
    },
    discoveryState: () => discovery,
  } satisfies OAuthClientProvider
}

/**
 * A plugin that signs the user in to a remote MCP server (for example Notion
 * or Linear) and gives the model its tools, the way Claude Code connects to
 * MCP servers:
 *
 * - `/connect <id>` finds the server's OAuth settings, registers a client,
 *   and opens the browser (PKCE, loopback on `127.0.0.1`).
 * - The tokens stay in the credential store. The model never sees them.
 * - After sign-in, the next turn has the server's tools, named `<prefix>_<tool>`.
 *   Tools that can change data ask for approval.
 *
 * @example
 * ```ts
 * const notion = mcpConnector({ id: 'notion', label: 'Notion', url: 'https://mcp.notion.com/mcp' })
 * ```
 */
export function mcpConnector(options: McpConnectorOptions) {
  const { id, label, url } = options
  const prefix = options.prefix ?? id
  const clientName = options.clientName ?? 'TanStack AI Harness'
  return definePlugin({
    name: `connector/${id}`,
    setup: async (ctx) => {
      let connected = (await ctx.credentials.get(id)) !== null
      let client: MCPClient | undefined
      let tools: ReadonlyArray<AnyTool> | undefined
      const reset = async () => {
        tools = undefined
        const open = client
        client = undefined
        await open?.close().catch(() => {})
      }
      await ctx.resources.acquire(
        () => undefined,
        () => reset(),
      )

      return {
        prompts: [
          {
            id: `connector/${id}:status`,
            text: () =>
              connected
                ? ''
                : `${label} is not connected. If the user asks for ${label}, tell them to run /connect ${id}.`,
          },
        ],
        discoverTools: async () => {
          if (!connected) return []
          if (!tools) {
            // The SDK only refreshes tokens for a client with a redirect URL.
            // Without one it treats the client as machine-to-machine. A new
            // browser sign-in still happens only through /connect.
            const saved = await ctx.credentials.get(id)
            const redirectUri =
              (saved?.type === 'oauth'
                ? saved.client?.redirectUri
                : undefined) ?? 'http://127.0.0.1/callback'
            try {
              client = await createMCPClient({
                transport: {
                  type: 'http',
                  url,
                  authProvider: credentialProvider(id, ctx.credentials, {
                    redirectUri,
                    clientName,
                    scopes: options.scopes,
                  }),
                  ...(options.fetch ? { fetch: options.fetch } : {}),
                },
                prefix,
                needsApproval:
                  options.needsApproval ??
                  ((tool) => tool.annotations?.readOnlyHint !== true),
              })
            } catch (error) {
              // The server wants a new sign-in: ask the user to run /connect.
              // Other failures, for example a server that is down, stay
              // connection errors.
              const needsSignIn =
                error instanceof MCPConnectionError &&
                error.cause instanceof AuthRequiredError
              if (!needsSignIn) throw error
              connected = false
              ctx.session.authRequired({ connector: id })
              throw error.cause
            }
            tools = (await client.tools()) as ReadonlyArray<AnyTool>
          }
          return tools
        },
        commands: {
          [`connect:${id}`]: defineCommand({
            description: `Sign in to ${label}`,
            run: async () => {
              const receiver = await startLoopbackReceiver()
              const state = randomBytes(16).toString('base64url')
              try {
                const provider = credentialProvider(id, ctx.credentials, {
                  redirectUri: receiver.redirectUri,
                  clientName,
                  scopes: options.scopes,
                  state,
                  onRedirect: (authorizationUrl) =>
                    ctx.session.authRequired({
                      connector: id,
                      url: authorizationUrl.href,
                    }),
                })
                const fetchFn = options.fetch ? { fetchFn: options.fetch } : {}
                // A new sign-in has no tokens, so this always ends in a
                // redirect to the browser.
                await auth(provider, { serverUrl: url, ...fetchFn })
                // The error names the service: a sign-in can end minutes later.
                const { code, iss } = await receiver
                  .waitForCode(state)
                  .catch((error: unknown) => {
                    throw new Error(
                      `${label}: ${error instanceof Error ? error.message : String(error)}`,
                    )
                  })
                // A server that sends `iss` (RFC 9207), such as Linear, gets
                // it checked. Without it, the SDK refuses the code.
                await auth(provider, {
                  serverUrl: url,
                  authorizationCode: code,
                  ...(iss ? { iss } : {}),
                  ...fetchFn,
                })
              } finally {
                receiver.close()
              }
              connected = true
              await reset()
              return `Connected to ${label}.`
            },
          }),
          [`disconnect:${id}`]: defineCommand({
            description: `Sign out of ${label}`,
            run: async () => {
              await ctx.credentials.delete(id)
              connected = false
              await reset()
              return `Disconnected from ${label}.`
            },
          }),
        },
      }
    },
  })
}
