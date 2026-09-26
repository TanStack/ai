import type { Scope } from '@tanstack/ai'
import type { Credential, CredentialStore } from '@tanstack/ai-persistence'

/**
 * Thrown when a tool or command needs a credential the user has not saved.
 * The session publishes `harness.auth_required`, so a host can show the
 * sign-in link or run `/connect`.
 */
export class AuthRequiredError extends Error {
  readonly connector: string
  readonly url: string | undefined
  constructor(connector: string, url?: string) {
    super(
      url
        ? `Sign in to ${connector} first: ${url}`
        : `Sign in to ${connector} first. Run /connect ${connector}.`,
    )
    this.name = 'AuthRequiredError'
    this.connector = connector
    this.url = url
  }
}

/** Credentials of the session's principal, as plugins see them. */
export interface CredentialsAccess {
  get: (id: string) => Promise<Credential | null>
  /** Like `get`, but throws {@link AuthRequiredError} when the credential is missing. */
  require: (id: string) => Promise<Credential>
  set: (id: string, credential: Credential) => Promise<void>
  delete: (id: string) => Promise<void>
  list: () => Promise<
    Array<{ id: string; type: Credential['type']; expiresAt?: number }>
  >
}

/** Scope credentials to one principal and thread. */
export function credentialsFor(
  store: CredentialStore,
  scope: Scope,
  onMissing: (error: AuthRequiredError) => void,
): CredentialsAccess {
  return {
    get: (id) => store.get(scope, id),
    require: async (id) => {
      const credential = await store.get(scope, id)
      if (credential) return credential
      const error = new AuthRequiredError(id)
      onMissing(error)
      throw error
    },
    set: (id, credential) => store.set(scope, id, credential),
    delete: (id) => store.delete(scope, id),
    list: () => store.list(scope),
  }
}

/** Remove secret-looking values from a message before it reaches a model or a log. */
export function scrubSecrets(
  text: string,
  secrets: ReadonlyArray<string>,
): string {
  let scrubbed = text
  for (const secret of secrets) {
    if (secret.length >= 6) scrubbed = scrubbed.split(secret).join('[redacted]')
  }
  return scrubbed
}
