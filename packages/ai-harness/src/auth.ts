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
  set: (entry: { id: string; credential: Credential }) => Promise<void>
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

// The secret values each access read or saved, so a session can scrub them
// from the errors it sends to clients.
const handedOut = new WeakMap<CredentialsAccess, Set<string>>()

/** The secret values that `accesses` read or saved. */
export function secretsOf(...accesses: Array<CredentialsAccess>) {
  return accesses.flatMap((access) => [...(handedOut.get(access) ?? [])])
}

function secretValues(credential: Credential) {
  if (credential.type === 'api_key') return [credential.value]
  const { accessToken, refreshToken, client } = credential
  return [accessToken, refreshToken, client?.clientSecret].filter(
    (value) => value !== undefined,
  )
}

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
  const secrets = new Set<string>()
  const keep = (credential: Credential | null) => {
    for (const value of credential ? secretValues(credential) : []) {
      secrets.add(value)
    }
    return credential
  }
  // ponytail: a refreshed tenant OAuth token is saved for the user, so each
  // user keeps a copy. A provider that rotates refresh tokens would need a
  // save for the whole tenant to share one token.
  const get = async (id: string) => {
    const user = scopeNow()
    const own = await store.get({ scope: user, id })
    if (own) return keep(own)
    const tenant = tenantOf(user)
    return keep(tenant ? await store.get({ scope: tenant, id }) : null)
  }
  const access: CredentialsAccess = {
    get,
    require: async (id, options) => {
      const credential = await get(id)
      if (credential) return credential
      const error = new AuthRequiredError(id)
      onMissing(error)
      if (options?.wait && hooks?.canWait?.(id)) throw signInRequired(error)
      throw error
    },
    set: async ({ id, credential }) => {
      keep(credential)
      await store.set({ scope: scopeNow(), id, credential })
      await hooks?.onSet?.(id)
    },
    delete: (id) => store.delete({ scope: scopeNow(), id }),
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
  handedOut.set(access, secrets)
  return access
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
    const fromEnv = envKeyOf(provider)?.value
    if (fromEnv) handedOut.get(credentials)?.add(fromEnv)
    return fromEnv ?? null
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

/**
 * Replace each of `secrets` in `text` with `[redacted]`: the raw value, its
 * JSON-escaped form, and its URL-encoded form. A secret shorter than 6
 * characters is left alone, so a tiny value does not redact common words.
 */
export function scrubSecrets(
  text: string,
  secrets: ReadonlyArray<string>,
): string {
  const forms = new Set<string>()
  for (const secret of secrets) {
    if (secret.length < 6) continue
    forms.add(secret)
    forms.add(JSON.stringify(secret).slice(1, -1))
    forms.add(encodeURIComponent(secret))
  }
  // The longest first, so a secret inside another does not leave a part.
  let scrubbed = text
  for (const form of [...forms].sort((a, b) => b.length - a.length)) {
    scrubbed = scrubbed.split(form).join('[redacted]')
  }
  return scrubbed
}
