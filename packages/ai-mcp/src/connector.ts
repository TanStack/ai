import { randomBytes } from 'node:crypto'
import { auth, createFetchWithInit } from '@modelcontextprotocol/client'
import {
  AuthRequiredError,
  defineCommand,
  definePlugin,
} from '@tanstack/ai-harness'
import { startLoopbackReceiver } from '@tanstack/ai-harness/oauth'
import { connectTransport } from './client'
import { MCPConnectionError } from './errors'
import {
  askForInput,
  elicitFor,
  harnessClientOptions,
  trackCaller,
} from './harness-plugin'
import type { Caller } from './harness-plugin'
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
} from '@modelcontextprotocol/client'
import type { AnyTool } from '@tanstack/ai'
import type {
  CredentialsAccess,
  RunContext,
  TurnInfo,
} from '@tanstack/ai-harness'
import type { MCPClient } from './client'
import type { MCPClientOptions } from './types'

export interface McpConnectorOptions {
  /** A short id, for example `'notion'`. Commands are `connect:<id>` and `disconnect:<id>`. */
  id: string
  label: string
  /** The MCP server URL (Streamable HTTP), for example `https://mcp.notion.com/mcp`. */
  url: string
  /** Tool name prefix. Default: the id. Tools are named `<prefix>_<tool>` unless `toolName` is set. */
  prefix?: string
  /**
   * The name the model sees for each tool. Wins over `prefix`.
   * See `MCPClientOptions.toolName`.
   */
  toolName?: MCPClientOptions['toolName']
  /** Sent with the connect handshake, tool lists, tool calls, resources, and prompts. See `MCPClientOptions.requestOptions`. */
  requestOptions?: MCPClientOptions['requestOptions']
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
  /** The access token this provider last gave the SDK or saved. */
  let seenToken: string | undefined
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
      seenToken = credential.accessToken
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
      // On a refresh, the SDK passes the old refresh token itself.
      const credential = {
        type: 'oauth' as const,
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
      }
      if (options.onRedirect) {
        // A new sign-in replaces the old one, with all its tokens.
        await credentials.set({ id, credential })
        seenToken = credential.accessToken
        return
      }
      // A refresh. The SDK sends the refresh request itself, so two
      // sessions can both refresh: only the save is single-flight and
      // compare-and-set. `refresh` saves where the credential is (a tenant
      // token stays the tenant's). When the saved token is not the one this
      // session refreshed, another session saved first: its token stays, and
      // the next connect uses it. This connection keeps the SDK's new token.
      const saved = await credentials.refresh(id, (current) =>
        Promise.resolve(
          current.type === 'oauth' &&
            seenToken !== undefined &&
            current.accessToken !== seenToken
            ? current
            : credential,
        ),
      )
      // The user signed out while the SDK refreshed. The new tokens are not
      // saved, so the sign-out holds, and the call asks for a sign-in.
      if (!saved) throw new AuthRequiredError(id)
      // The token this connection uses, also when another one was saved.
      seenToken = credential.accessToken
    },
    // The SDK calls this with 'client' or 'tokens' when the server refuses
    // the saved client or refresh token, for example a revoked refresh token.
    // Both are in one saved credential, so either scope deletes it, and the
    // user signs in again. A new sign-in keeps the old one until it works.
    // Another session can save a new token after this one read its token,
    // for example after a refresh. Then the saved token is not the one the
    // server refused, so it stays.
    invalidateCredentials: async () => {
      if (options.onRedirect) return
      const saved = await stored()
      if (saved && seenToken !== undefined && saved.accessToken !== seenToken)
        return
      await credentials.delete(id)
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

/** The MCP sign-in of one sender, with its client and tools once found. */
interface Connection {
  connected: boolean
  client?: MCPClient
  tools?: ReadonlyArray<AnyTool>
  /** The server sent `tools/list_changed`: the next turn lists again. */
  stale?: boolean
  /** Wraps a tool list of `client` for the session. */
  wrap?: (tools: ReadonlyArray<AnyTool>) => ReadonlyArray<AnyTool>
}

/**
 * A plugin that signs the user in to a remote MCP server (for example Notion
 * or Linear) and gives the model its tools, the way Claude Code connects to
 * MCP servers:
 *
 * - `/connect <id>` finds the server's OAuth settings, registers a client,
 *   and opens the browser (PKCE, loopback on `127.0.0.1`).
 * - The tokens stay in the credential store. The model never sees them.
 * - After sign-in, the next turn has the server's tools, named
 *   `<prefix>_<tool>` by default. `toolName` can change the names.
 *   Tools that can change data ask for approval.
 * - When the connection closes, the next turn connects again. When the
 *   server sends `tools/list_changed`, the next turn lists its tools again.
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
      // One sign-in per user of a run, by tenant and id: in a shared thread,
      // one person's sign-in, client, and tools never serve another
      // person's turn.
      const connections = new Map<string, Connection>()
      const keyOf = (user: RunContext['user']) =>
        user ? JSON.stringify([user.tenantId ?? null, user.id]) : ''
      const close = async (connection: Connection | undefined) => {
        await connection?.client?.close().catch(() => {})
      }
      /** Set the sign-in of `user`, and drop its old client and tools. */
      const signedIn = async (user: RunContext['user'], connected: boolean) => {
        const key = keyOf(user)
        const old = connections.get(key)
        connections.set(key, { connected })
        await close(old)
      }
      await ctx.resources.acquire(
        () => undefined,
        () => Promise.all([...connections.values()].map(close)),
      )

      return {
        prompts: [
          {
            id: `connector/${id}:status`,
            // Read after `discoverTools`, which finds the state of the
            // turn's user.
            text: (turn: TurnInfo) =>
              connections.get(keyOf(turn.run.user))?.connected
                ? ''
                : `${label} is not connected. If the user asks for ${label}, tell them to run /connect ${id}.`,
          },
        ],
        // Runs for each turn, with the run of that turn: its user and that
        // user's credentials.
        discoverTools: async (turn: TurnInfo) => {
          const { user, credentials } = turn.run
          const key = keyOf(user)
          let connection = connections.get(key)
          if (!connection) {
            connection = { connected: (await credentials.get(id)) !== null }
            connections.set(key, connection)
          }
          if (!connection.connected) return []
          if (!connection.tools) {
            // The SDK only refreshes tokens for a client with a redirect URL.
            // Without one it treats the client as machine-to-machine. A new
            // browser sign-in still happens only through /connect.
            const saved = await credentials.get(id)
            const redirectUri =
              (saved?.type === 'oauth'
                ? saved.client?.redirectUri
                : undefined) ?? 'http://127.0.0.1/callback'
            // The tool calls of this client that run now, newest last.
            const calling: Array<Caller> = []
            const current = connection
            let opened: MCPClient | undefined
            try {
              opened = await connectTransport(
                {
                  transport: {
                    type: 'http',
                    url,
                    authProvider: credentialProvider(id, credentials, {
                      redirectUri,
                      clientName,
                      scopes: options.scopes,
                    }),
                    ...(options.fetch ? { fetch: options.fetch } : {}),
                  },
                  prefix,
                  toolName: options.toolName,
                  requestOptions: options.requestOptions,
                  needsApproval:
                    options.needsApproval ??
                    ((tool) => tool.annotations?.readOnlyHint !== true),
                  clientOptions: harnessClientOptions,
                  // A dropped connection: the next turn connects again.
                  onClose: () => {
                    if (current.client !== opened) return
                    current.client = undefined
                    current.tools = undefined
                  },
                  onToolListChanged: () => {
                    if (current.client === opened) current.stale = true
                  },
                },
                elicitFor(calling),
              )
              connection.client = opened
              connection.stale = false
            } catch (error) {
              // The server wants a new sign-in: ask the user to run /connect.
              // Other failures, for example a server that is down, stay
              // connection errors.
              const needsSignIn =
                error instanceof MCPConnectionError &&
                error.cause instanceof AuthRequiredError
              if (!needsSignIn) throw error
              connection.connected = false
              ctx.session.authRequired({ connector: id })
              throw error.cause
            }
            const client = opened
            // A failed tool list closes the client: the next turn connects
            // again, and must not leave this one open.
            const listed = await client
              .tools()
              .catch(async (error: unknown) => {
                connection.client = undefined
                await client.close().catch(() => {})
                throw error
              })
            const wrap = (found: ReadonlyArray<AnyTool>) =>
              askForInput(trackCaller(found, ctx.session, calling), ctx.session)
            connection.wrap = wrap
            connection.tools = wrap(listed as ReadonlyArray<AnyTool>)
          } else if (connection.stale && connection.client) {
            // After `tools/list_changed`: list the tools again. On a
            // failure, the old list stays, and the next turn tries again.
            connection.stale = false
            const client = connection.client
            const listed = await client.tools().catch(() => undefined)
            if (listed === undefined) connection.stale = true
            else if (connection.client === client && connection.wrap) {
              connection.tools = connection.wrap(
                listed as ReadonlyArray<AnyTool>,
              )
            }
          }
          return connection.tools
        },
        commands: {
          [`connect:${id}`]: defineCommand({
            description: `Sign in to ${label}`,
            // The sign-in belongs to the user who runs the command. A cancel
            // or a session close stops it at once: the loopback stops
            // listening, and the OAuth requests abort. The `session` of the
            // command makes the sign-in a wait of the command run.
            run: async (_input, { run, session }) => {
              const { signal } = run
              const receiver = await startLoopbackReceiver({ signal })
              const state = randomBytes(16).toString('base64url')
              try {
                const provider = credentialProvider(id, run.credentials, {
                  redirectUri: receiver.redirectUri,
                  clientName,
                  scopes: options.scopes,
                  state,
                  onRedirect: (authorizationUrl) =>
                    session.authRequired({
                      connector: id,
                      url: authorizationUrl.href,
                    }),
                })
                const fetchFn = createFetchWithInit(options.fetch, { signal })
                // A new sign-in has no tokens, so this always ends in a
                // redirect to the browser.
                await auth(provider, { serverUrl: url, fetchFn })
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
                  fetchFn,
                })
              } finally {
                receiver.close()
              }
              await signedIn(run.user, true)
              return `Connected to ${label}.`
            },
          }),
          [`disconnect:${id}`]: defineCommand({
            description: `Sign out of ${label}`,
            run: async (_input, { run }) => {
              await run.credentials.delete(id)
              await signedIn(run.user, false)
              return `Disconnected from ${label}.`
            },
          }),
        },
      }
    },
  })
}
