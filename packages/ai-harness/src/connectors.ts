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
import type { RunContext } from './types'

export interface OAuthConnectorOptions {
  /** A short id, for example `'github'`. Commands are `connect:<id>` and `disconnect:<id>`. */
  id: string
  label: string
  oauth: OAuthConfig
  /**
   * How the user signs in. Required, because only you know where the harness
   * runs:
   *
   * - `'device'`: show a code to enter on another device. It works on a
   *   server, and needs `oauth.deviceUrl`.
   * - `'loopback'`: open a browser on this machine and listen on
   *   `127.0.0.1` for the redirect. Only for a harness that runs on the
   *   user's own machine, such as a CLI.
   */
  login: 'loopback' | 'device'
  /**
   * The tools of this service. Call `token({ run: ctx.context.run })` inside
   * a tool (typed `.server<HarnessRunContext>`): it returns a fresh access
   * token of the user of that call, or fails with `auth_required` before
   * that user signs in. With `wait: true`, the turn waits for the sign-in and
   * the tool runs again after it (see `CredentialsAccess.require`).
   */
  tools?: (
    token: (options: { run: RunContext; wait?: boolean }) => Promise<string>,
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
 *   login: 'device',
 *   oauth: { authorizationUrl, tokenUrl, deviceUrl, clientId, scopes: ['repo'] },
 *   tools: (token) => [
 *     listIssues.server<HarnessRunContext>(async (_args, ctx) =>
 *       fetchIssues(await token({ run: ctx.context.run })),
 *     ),
 *   ],
 * })
 * ```
 */
export function oauthConnector(options: OAuthConnectorOptions) {
  const { id, label, oauth } = options
  return definePlugin({
    name: `connector/${id}`,
    setup: () => {
      // The token of the user of the run that calls, never of another run.
      const token = async ({
        run,
        wait,
      }: {
        run: RunContext
        wait?: boolean
      }) => {
        const { credentials } = run
        let credential = await credentials.require(id, { wait })
        if (credential.type !== 'oauth') return credential.value
        if (isExpired(credential) && credential.refreshToken) {
          // `refresh` runs one refresh at a time and saves it where the
          // credential is. The saved one can be fresh already: another call
          // refreshed it after the read above.
          // The request runs with the host signal: when this run stops,
          // only this call fails, and the refresh goes on for the others.
          const fresh = await credentials.refresh(
            id,
            (current, signal) =>
              isExpired(current) &&
              current.type === 'oauth' &&
              current.refreshToken
                ? refreshCredential(oauth, current, {
                    fetch: options.fetch,
                    signal,
                  })
                : Promise.resolve(current),
            { signal: run.signal },
          )
          // The credential was deleted meanwhile: ask for a sign-in.
          credential = fresh ?? (await credentials.require(id, { wait }))
        }
        if (credential.type !== 'oauth') return credential.value
        return credential.accessToken
      }
      return {
        tools: options.tools?.(token) ?? [],
        commands: {
          [`connect:${id}`]: defineCommand({
            description: `Sign in to ${label}`,
            // The sign-in belongs to the user who runs the command. A cancel
            // or a session close stops it at once. The `session` of the
            // command makes the sign-in a wait of the command run.
            run: async (_input, { credentials, signal, session }) => {
              const credential =
                options.login === 'device'
                  ? await deviceLogin(oauth, {
                      onCode: ({ userCode, verificationUri, expiresAt }) =>
                        session.authRequired({
                          connector: id,
                          url: verificationUri,
                          userCode,
                          expiresAt,
                        }),
                      fetch: options.fetch,
                      signal,
                    })
                  : await loopbackLogin(oauth, {
                      onUrl: (url) =>
                        session.authRequired({ connector: id, url }),
                      fetch: options.fetch,
                      signal,
                    })
              await credentials.set({ id, credential })
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
