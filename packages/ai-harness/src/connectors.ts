import { defineCommand } from './commands'
import { definePlugin } from './plugins'
import {
  deviceLogin,
  isExpired,
  loopbackLogin,
  refreshCredential,
} from './oauth'
import type { AnyTool } from '@tanstack/ai'
import type { OAuthConfig } from './oauth'

export interface OAuthConnectorOptions {
  /** A short id, for example `'github'`. Commands are `connect:<id>` and `disconnect:<id>`. */
  id: string
  label: string
  oauth: OAuthConfig
  /** `'loopback'` (default) opens a browser here. `'device'` shows a code to enter elsewhere. */
  login?: 'loopback' | 'device'
  /**
   * The tools of this service. Call `token()` inside a tool: it returns a
   * fresh access token, or fails with `auth_required` before sign-in. With
   * `token({ wait: true })`, the turn waits for the sign-in and the tool
   * runs again after it (see `CredentialsAccess.require`).
   */
  tools?: (
    token: (options?: { wait?: boolean }) => Promise<string>,
  ) => ReadonlyArray<AnyTool>
  /** Test hook for the token endpoint. */
  fetch?: typeof fetch
}

/**
 * A plugin that signs the user in to an OAuth service and gives the model
 * that service's tools. Adds `connect:<id>` and `disconnect:<id>` commands.
 * Tokens stay in the credential store. The model never sees them.
 *
 * @example
 * ```ts
 * const github = oauthConnector({
 *   id: 'github',
 *   label: 'GitHub',
 *   oauth: { authorizationUrl, tokenUrl, deviceUrl, clientId, scopes: ['repo'] },
 *   tools: (token) => [listIssues(token)],
 * })
 * ```
 */
export function oauthConnector(options: OAuthConnectorOptions) {
  const { id, label, oauth } = options
  return definePlugin({
    name: `connector/${id}`,
    setup: (ctx) => {
      const token = async (tokenOptions?: {
        wait?: boolean
      }): Promise<string> => {
        let credential = await ctx.credentials.require(id, tokenOptions)
        if (credential.type === 'api_key') return credential.value
        if (isExpired(credential) && credential.refreshToken) {
          credential = await refreshCredential(oauth, credential, options.fetch)
          await ctx.credentials.set(id, credential)
        }
        if (credential.type === 'api_key') return credential.value
        return credential.accessToken
      }
      return {
        tools: options.tools?.(token) ?? [],
        commands: {
          [`connect:${id}`]: defineCommand({
            description: `Sign in to ${label}`,
            // The sign-in belongs to the user who runs the command.
            run: async (_input, { credentials }) => {
              const credential =
                options.login === 'device'
                  ? await deviceLogin(oauth, {
                      onCode: ({ userCode, verificationUri }) =>
                        ctx.session.authRequired({
                          connector: id,
                          url: verificationUri,
                          userCode,
                        }),
                      ...(options.fetch ? { fetch: options.fetch } : {}),
                    })
                  : await loopbackLogin(oauth, {
                      onUrl: (url) =>
                        ctx.session.authRequired({ connector: id, url }),
                      ...(options.fetch ? { fetch: options.fetch } : {}),
                    })
              await credentials.set(id, credential)
              return `Connected to ${label}.`
            },
          }),
          [`disconnect:${id}`]: defineCommand({
            description: `Sign out of ${label}`,
            run: async (_input, { credentials }) => {
              await credentials.delete(id)
              return `Disconnected from ${label}.`
            },
          }),
        },
      }
    },
  })
}
