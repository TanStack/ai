import { isKeyedAdapter } from '@tanstack/ai'
import type { ProviderKeys, Scope } from '@tanstack/ai'
import type { ByokProvider, ProviderId } from '@tanstack/ai/byok'
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

/**
 * The first name in `provider.env` that is set, with its value. A provider
 * id has no env names. Where `process` is missing (a browser, a worker) it
 * returns `null`.
 */
export function envKeyOf(provider: ByokProvider | ProviderId) {
  if (typeof provider === 'string') return null
  const env = globalThis.process?.env
  for (const name of provider.env ?? []) {
    const value = env?.[name]
    if (typeof value === 'string' && value.length > 0) return { name, value }
  }
  return null
}

/**
 * The provider keys of the session's principal. A key is the `api_key`
 * credential saved under the provider id (`/connect <id>` saves it), else
 * the first `provider.env` name that is set. A missing key calls `onMissing`
 * and throws {@link AuthRequiredError}, so the user sees `/connect <id>`.
 */
export function providerKeysFor(
  credentials: CredentialsAccess,
  onMissing: (error: AuthRequiredError) => void,
) {
  const providerIdOf = (provider: ByokProvider | ProviderId) =>
    typeof provider === 'string' ? provider : provider.id
  const get = async (provider: ByokProvider | ProviderId) => {
    const saved = await credentials.get(providerIdOf(provider))
    if (saved?.type === 'api_key') return saved.value
    return envKeyOf(provider)?.value ?? null
  }
  const requireKey = async (provider: ByokProvider | ProviderId) => {
    const key = await get(provider)
    if (key !== null) return key
    const error = new AuthRequiredError(providerIdOf(provider))
    onMissing(error)
    throw error
  }
  const keys: ProviderKeys = {
    get,
    require: requireKey,
    adapter: async (adapter) =>
      isKeyedAdapter(adapter)
        ? adapter.create(await requireKey(adapter.provider))
        : adapter,
  }
  return keys
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
