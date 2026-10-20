import { isKeyedAdapter } from '@tanstack/ai'
import { scrubSecrets } from '@tanstack/ai/byok'
import {
  envKeyEntry,
  readCredential,
  readCredentialEntry,
  tenantScopeOf,
} from '@tanstack/ai/byok/server'
import type { ChatMiddleware, ProviderKeys, Scope } from '@tanstack/ai'
import type {
  ByokProvider,
  Credential,
  CredentialScope,
  CredentialStore,
  ProviderId,
} from '@tanstack/ai/byok'

// The harness API had its own copy. The core one is the only body now.
export { scrubSecrets }

/**
 * @internal The id prefix of a secret answer in the credential store. A host
 * that does not own the log saves the answer there, and the owner reads it
 * once. Its credential type is `secret_answer`, which `list` hides.
 */
export const SECRET_ANSWER_PREFIX = 'harness:answer:'

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
 * The credentials of one user: the user of a run (`ctx.context.run`), or of
 * a command. Reads and saves go to that user only.
 */
export interface CredentialsAccess {
  get: (id: string) => Promise<Credential | null>
  /**
   * Like `get`, but throws {@link AuthRequiredError} when the credential is
   * missing. With `wait: true`, a tool of a chat turn or of a background
   * agent run waits for the sign-in instead: the run stops with an
   * interrupt with the reason `'auth_required'`, a `sign-in` wait. When the
   * credential is saved (for example by `connect:<id>`), the run goes on
   * and the tool runs again. Cancel the interrupt to fail the tool. The
   * wait expires after 15 minutes, and then the tool fails too. Do not pass
   * `wait` elsewhere (a command, a hook): the credentials of a command never
   * wait, and outside a run `wait` does nothing.
   */
  require: (id: string, options?: { wait?: boolean }) => Promise<Credential>
  set: (entry: { id: string; credential: Credential }) => Promise<void>
  /**
   * Swap the saved credential `id` for a new one, for example an OAuth
   * refresh. `update` gets the saved credential and returns the new one, or
   * the same object to keep it. Resolves with the credential to use, or
   * `null` when none is saved.
   *
   * - The new credential goes back to the scope where it was found. A
   *   tenant credential stays the tenant's, and is not copied to the user.
   * - One host runs one `update` at a time per saved credential. A call
   *   that comes while one runs waits for it and gets its result.
   * - When the store has `getVersioned` and `setIf`, the save is a
   *   compare-and-set. If another host saved first, the call uses that
   *   credential, and does not run `update` again.
   * - `update` gets the signal of the host, not of a caller: an abort of
   *   `options.signal` rejects this call only, and the refresh goes on for
   *   the calls that wait for it.
   */
  refresh: (
    id: string,
    update: (current: Credential, signal: AbortSignal) => Promise<Credential>,
    options?: { signal?: AbortSignal },
  ) => Promise<Credential | null>
  delete: (id: string) => Promise<void>
  list: () => Promise<
    Array<{ id: string; type: Credential['type']; expiresAt?: number }>
  >
}

/**
 * What a session adds to `credentialsFor`: `canWait` says if a `require`
 * with `wait` can stop the turn now, and `onSet` runs after each save.
 * `secrets` gets each secret value the access reads or saves, so the session
 * can scrub them from what it stores, publishes, and sends to a model.
 */
export interface CredentialHooks {
  canWait?: (id: string) => boolean
  onSet?: (id: string) => Promise<void>
  secrets?: Redactor
  /**
   * The refreshes that run now, shared by every access of one host. See
   * {@link RefreshFlights}. Without it, only the calls of this access share
   * a refresh.
   */
  refreshes?: RefreshFlights
}

/**
 * @internal The refreshes of one host. A host keeps one for all its
 * sessions.
 */
export interface RefreshFlights {
  /** The refresh that runs now for each saved credential, by {@link refreshKey}. */
  running: Map<string, Promise<Credential | null>>
  /** The signal of each refresh. The host aborts it when it closes. */
  signal: AbortSignal
}

/** A {@link RefreshFlights} whose signal aborts with `controller`. */
export function refreshFlights(
  controller = new AbortController(),
): RefreshFlights {
  return { running: new Map(), signal: controller.signal }
}

/**
 * `promise`, or a rejection with the reason of `signal` when it aborts
 * first. The work of `promise` goes on.
 */
function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject<T>(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/** The key of one saved credential: its tenant, its user, and its id. */
const refreshKey = (scope: CredentialScope, id: string) =>
  JSON.stringify([scope.tenantId ?? null, scope.userId ?? null, id])

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

function secretValues(credential: Credential) {
  if (credential.type !== 'oauth') return [credential.value]
  const { accessToken, refreshToken, client } = credential
  return [accessToken, refreshToken, client?.clientSecret].filter(
    (value) => value !== undefined,
  )
}

/**
 * Scope credentials to one user and thread.
 *
 * A read finds the user's own credential first, then the tenant's (saved
 * without a `userId`). A save or a delete changes the user's own only. A
 * `refresh` writes back to the scope where it found the credential.
 */
export function credentialsFor(
  store: CredentialStore,
  scope: Scope,
  onMissing: (error: AuthRequiredError) => void,
  hooks?: CredentialHooks,
): CredentialsAccess {
  const secrets = hooks?.secrets
  const keep = (credential: Credential | null) => {
    for (const value of credential ? secretValues(credential) : []) {
      secrets?.add(value)
    }
    return credential
  }
  const get = async (id: string) => keep(await readCredential(store, scope, id))
  const flights = hooks?.refreshes ?? refreshFlights()
  type Entry = NonNullable<Awaited<ReturnType<typeof readCredentialEntry>>>
  /** True when the saved credential is not the one in `seen` any more. */
  const isChanged = (seen: Entry, now: Entry) =>
    seen.revision !== undefined && now.revision !== undefined
      ? seen.revision !== now.revision
      : JSON.stringify(seen.credential) !== JSON.stringify(now.credential)
  const runRefresh = async (
    id: string,
    seen: Entry,
    update: (current: Credential, signal: AbortSignal) => Promise<Credential>,
  ): Promise<Credential | null> => {
    let next: Credential
    try {
      next = await update(seen.credential, flights.signal)
    } catch (error) {
      // Another host can refresh first and use up the refresh token, so
      // this refresh fails. Then the token that host saved wins.
      const now = await readCredentialEntry(store, scope, id)
      if (now && isChanged(seen, now)) return now.credential
      throw error
    }
    if (next === seen.credential) return next
    if (store.setIf && seen.revision !== undefined) {
      const saved = await store.setIf({
        scope: seen.scope,
        id,
        credential: next,
        expectedRevision: seen.revision,
      })
      if (saved.ok) return next
      // Another host saved first. Use its credential, and do not refresh
      // again: with refresh token rotation, a second refresh can revoke
      // both tokens.
      return (await readCredentialEntry(store, scope, id))?.credential ?? null
    }
    // A store without `getVersioned` and `setIf` has no compare-and-set.
    // Then the refresh is single-flight on this host only: two hosts can
    // refresh at the same time, and the last save wins.
    await store.set({ scope: seen.scope, id, credential: next })
    return next
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
      await store.set({ scope, id, credential })
      await hooks?.onSet?.(id)
    },
    refresh: async (id, update, options) => {
      options?.signal?.throwIfAborted()
      const seen = await readCredentialEntry(store, scope, id)
      if (!seen) return null
      // Keyed by the scope where the credential is, so the users of one
      // tenant credential share one refresh too.
      const key = refreshKey(seen.scope, id)
      let flight = flights.running.get(key)
      if (!flight) {
        // The calls that join use the first call's `update`. It runs with
        // the host signal, so an abort of one caller stops no other caller.
        flight = runRefresh(id, seen, update).finally(() => {
          flights.running.delete(key)
        })
        flights.running.set(key, flight)
      }
      return keep(await untilAborted(flight, options?.signal))
    },
    delete: (id) => store.delete({ scope, id }),
    list: async () => {
      // A secret answer that the harness keeps is not the user's own.
      const saved = async (at: CredentialScope) =>
        (await store.list(at)).filter((item) => item.type !== 'secret_answer')
      const tenant = tenantScopeOf(scope)
      const own = await saved(scope)
      if (!tenant) return own
      const shared = await saved(tenant)
      return [
        ...own,
        ...shared.filter((item) => !own.some((o) => o.id === item.id)),
      ]
    },
  }
  return access
}

/**
 * The provider keys of the user of `credentials`. A key is the `api_key`
 * credential saved under the provider id (`/connect <id>` saves it), else
 * the first `provider.env` name that is set. With `envFallback: false`, env
 * vars are not read. A missing key calls `onMissing` and throws
 * {@link AuthRequiredError}, so the user sees `/connect <id>`. A key read
 * from env goes in `secrets`, like a saved credential.
 */
export function providerKeysFor(
  credentials: CredentialsAccess,
  onMissing: (error: AuthRequiredError) => void,
  { secrets, envFallback }: { secrets?: Redactor; envFallback: boolean },
) {
  const providerIdOf = (provider: ByokProvider | ProviderId) =>
    typeof provider === 'string' ? provider : provider.id
  const get = async (provider: ByokProvider | ProviderId) => {
    const saved = await credentials.get(providerIdOf(provider))
    if (saved?.type === 'api_key') return saved.value
    if (!envFallback) return null
    const fromEnv = envKeyEntry(provider)?.value
    if (fromEnv) secrets?.add(fromEnv)
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
 * @internal The secret values that one session handed out, and the scrub of
 * them. The session sends each log record, feed event, and model call
 * through it. See {@link createRedactor}.
 */
export type Redactor = ReturnType<typeof createRedactor>

/**
 * @internal A {@link Redactor} with no secret yet.
 *
 * `redact` never changes its input. It returns the same value when no
 * secret is in it, so a check of identity downstream stays cheap.
 */
export function createRedactor() {
  const values: Array<string> = []
  /** Each form that `scrubSecrets` replaces: raw, JSON-escaped, URL-encoded. */
  const forms: Array<string> = []

  /**
   * Scrub `value` from now on: a string, or each string in an array or a
   * plain object (a secret answer with fields). A string shorter than 6
   * characters is left.
   */
  const add = (value: unknown): void => {
    if (typeof value === 'object' && value !== null) {
      for (const item of Object.values(value)) add(item)
      return
    }
    if (typeof value !== 'string' || value.length < 6) return
    if (values.includes(value)) return
    values.push(value)
    for (const form of [
      value,
      JSON.stringify(value).slice(1, -1),
      encodeURIComponent(value),
    ]) {
      if (!forms.includes(form)) forms.push(form)
    }
  }

  /** `text` without the secrets. The same string when it has none. */
  const scrub = (text: string): string => {
    // A quick check first, so a text without a secret makes no copy.
    for (const form of forms) {
      if (text.includes(form)) return scrubSecrets(text, values)
    }
    return text
  }

  /** `items` with their secrets scrubbed, or `undefined` when none changed. */
  const walkAll = (items: Array<unknown>) => {
    let isChanged = false
    const next = items.map((item) => {
      const walked = walk(item)
      if (walked !== item) isChanged = true
      return walked
    })
    return isChanged ? next : undefined
  }

  /** `value` with its secrets scrubbed. A changed container is a copy. */
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return scrub(value)
    if (typeof value !== 'object' || value === null) return value
    if (Array.isArray(value)) return walkAll(value) ?? value
    // Each entry is a fresh `[key, value]` array, so an entry that did not
    // change comes back as it is.
    if (value instanceof Map) {
      const entries = walkAll([...value])
      return entries ? new Map(entries as Array<[unknown, unknown]>) : value
    }
    if (value instanceof Set) {
      const items = walkAll([...value])
      return items ? new Set(items) : value
    }
    // ponytail: other class instances (`Uint8Array`, `Date`, an app class)
    // stay as they are, since a copy could break them. Walk them if a
    // plugin keeps a secret in one.
    const proto: unknown = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return value
    const record = value as Record<string, unknown>
    let copy: Record<string, unknown> | undefined
    for (const key of Object.keys(record)) {
      const item = record[key]
      const next = walk(item)
      if (next === item) continue
      copy ??= Object.assign(Object.create(proto) as object, record)
      copy[key] = next
    }
    return copy ?? value
  }

  return {
    /** No secret to scrub yet. Then `redact` and `scrub` do no work. */
    get isEmpty(): boolean {
      return forms.length === 0
    },
    add,
    scrub,
    /**
     * `value` with each string in it scrubbed, in arrays, plain objects,
     * `Map`s, and `Set`s at any depth. A changed container is a copy. Other
     * values (numbers, class instances like `Uint8Array`) stay as they are.
     */
    redact: <T>(value: T): T =>
      forms.length === 0 ? value : (walk(value) as T),
  }
}

/**
 * @internal The model gets the context without the secrets of `redactor`.
 * Put it after `mediaMiddleware`, so no later middleware sets the messages
 * again. The transcript itself is not changed here: the log view scrubs it.
 */
export function redactMiddleware(redactor: Redactor): ChatMiddleware {
  return {
    name: 'harness:redact',
    onConfig(_ctx, config) {
      if (redactor.isEmpty) return undefined
      const messages = config.providerMessages ?? config.messages
      const providerMessages = redactor.redact(messages)
      const systemPrompts = redactor.redact(config.systemPrompts)
      if (
        providerMessages === messages &&
        systemPrompts === config.systemPrompts
      ) {
        return undefined
      }
      return { providerMessages, systemPrompts }
    },
  }
}
