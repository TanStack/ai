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

/**
 * Credentials of the running turn's sender (outside a turn, of the session's
 * principal), as plugins see them.
 */
export interface CredentialsAccess {
  get: (id: string) => Promise<Credential | null>
  /**
   * Like `get`, but throws {@link AuthRequiredError} when the credential is
   * missing. With `wait: true`, a tool of a chat turn waits for the sign-in
   * instead: the turn stops with an interrupt with the reason
   * `'auth_required'`. When the credential is saved (for example by
   * `connect:<id>`), the turn goes on and the tool runs again. Cancel the
   * interrupt to fail the tool. `wait` is for a tool of the running chat
   * turn. Do not pass it elsewhere (a command, a background agent, a hook):
   * the credentials of a command never wait, and outside a chat turn `wait`
   * does nothing.
   */
  require: (id: string, options?: { wait?: boolean }) => Promise<Credential>
  set: (id: string, credential: Credential) => Promise<void>
  delete: (id: string) => Promise<void>
  list: () => Promise<
    Array<{ id: string; type: Credential['type']; expiresAt?: number }>
  >
}

/**
 * What a session adds to `credentialsFor`: `canWait` says if a `require`
 * with `wait` can stop the turn now, and `onSet` runs after each save.
 */
export interface CredentialHooks {
  canWait?: (id: string) => boolean
  onSet?: (id: string) => Promise<void>
}

/**
 * The error that chat() reads as "stop the turn for input" (the shape of
 * `MCPInputRequiredError`), with the reason `'auth_required'`.
 */
function signInRequired(error: AuthRequiredError) {
  return Object.assign(new Error(error.message), {
    name: 'MCPInputRequiredError',
    kind: 'form' as const,
    reason: 'auth_required',
    request: {
      connector: error.connector,
      ...(error.url ? { url: error.url } : {}),
    },
  })
}

/**
 * The tenant scope of a user scope: the same tenant, no user. A credential
 * saved there belongs to every user of the tenant.
 */
const tenantOf = ({ userId, ...tenant }: Scope): Scope | undefined =>
  userId === undefined ? undefined : tenant

/**
 * Scope credentials to one principal and thread. A function `scope` is read
 * at each call, so the scope can follow the sender of the running turn.
 *
 * A read finds the user's own credential first, then the tenant's (saved
 * without a `userId`). A save or a delete changes the user's own only.
 */
export function credentialsFor(
  store: CredentialStore,
  scope: Scope | (() => Scope),
  onMissing: (error: AuthRequiredError) => void,
  hooks?: CredentialHooks,
): CredentialsAccess {
  const scopeNow = typeof scope === 'function' ? scope : () => scope
  // ponytail: a refreshed tenant OAuth token is saved for the user, so each
  // user keeps a copy. A provider that rotates refresh tokens would need a
  // save for the whole tenant to share one token.
  const get = async (id: string) => {
    const user = scopeNow()
    const own = await store.get(user, id)
    if (own) return own
    const tenant = tenantOf(user)
    return tenant ? store.get(tenant, id) : null
  }
  return {
    get,
    require: async (id, options) => {
      const credential = await get(id)
      if (credential) return credential
      const error = new AuthRequiredError(id)
      onMissing(error)
      if (options?.wait && hooks?.canWait?.(id)) throw signInRequired(error)
      throw error
    },
    set: async (id, credential) => {
      await store.set(scopeNow(), id, credential)
      await hooks?.onSet?.(id)
    },
    delete: (id) => store.delete(scopeNow(), id),
    list: async () => {
      const user = scopeNow()
      const tenant = tenantOf(user)
      const own = await store.list(user)
      if (!tenant) return own
      const shared = await store.list(tenant)
      return [
        ...own,
        ...shared.filter((item) => !own.some((o) => o.id === item.id)),
      ]
    },
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
