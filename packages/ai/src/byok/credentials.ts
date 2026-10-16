import type { Scope } from '../scope'

/**
 * Who owns a credential: a user, a tenant, or both. A credential belongs to
 * no thread, so `threadId` is optional and a store ignores it. A full
 * {@link Scope} works too.
 */
export type CredentialScope = Pick<Scope, 'tenantId' | 'userId'> &
  Partial<Pick<Scope, 'threadId'>>

/** A secret a user or an organization saved: an API key or OAuth tokens. */
export type Credential =
  | { type: 'api_key'; value: string }
  | {
      type: 'oauth'
      accessToken: string
      refreshToken?: string
      expiresAt?: number
      scopes?: Array<string>
      /**
       * The OAuth client these tokens belong to (for example one made by
       * dynamic client registration). A refresh needs it. `issuer` is the
       * authorization server that issued the client and the tokens.
       */
      client?: {
        clientId: string
        clientSecret?: string
        redirectUri?: string
        issuer?: string
      }
    }

/**
 * Durable store for credentials on the server, keyed by `scope.tenantId`,
 * `scope.userId`, and the credential id (a provider id such as `'openai'`, or
 * a connector id such as `'github'`). A credential saved without
 * `scope.userId` belongs to the tenant. A scope with neither is one shared
 * bucket. Encrypt the secrets at rest in your implementation.
 */
export interface CredentialStore {
  get: (key: {
    scope: CredentialScope
    id: string
  }) => Promise<Credential | null>
  set: (entry: {
    scope: CredentialScope
    id: string
    credential: Credential
  }) => Promise<void>
  delete: (key: { scope: CredentialScope; id: string }) => Promise<void>
  /** Ids and types only. `list` never returns secret values. */
  list: (
    scope: CredentialScope,
  ) => Promise<
    Array<{ id: string; type: Credential['type']; expiresAt?: number }>
  >
}

/** Type a {@link CredentialStore} implementation inline. */
export function defineCredentialStore(store: CredentialStore): CredentialStore {
  return store
}
