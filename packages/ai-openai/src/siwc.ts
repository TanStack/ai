import { openaiByok } from './byok'

/**
 * Sign in with ChatGPT (SIWC) for BYOK. The user signs in with their ChatGPT
 * account and the access token bills their ChatGPT plan instead of an API key.
 *
 * OpenAI allows this only for open-source and locally hosted apps, and only
 * with a `http://127.0.0.1:<port>/auth/callback` redirect.
 * https://developers.openai.com/siwc/token-sharing-open-source
 *
 * The access token goes into the `openai` BYOK slot, so the relay reads it
 * like an API key. The refresh credential goes into a second slot that no
 * send ever attaches, so the refresh token stays in the browser.
 */

const ISSUER = 'https://auth.openai.com'
const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`
const RESOURCE = 'https://api.openai.com/v1'
const SCOPE =
  'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const PLAN_SCOPE = 'chatgpt.tokens.use.direct'
const DYNAMIC_CLIENT_ID = 'dynamic_agent_client'
const CALLBACK_PATH = '/auth/callback'
const PENDING_STORAGE_KEY = 'byok:openai:siwc:pending:v1'
const HOST_STORAGE_KEY = 'byok:openai:siwc:host:v1'
/** Keyring slot for the refresh credential. Never sent to the relay. */
const CREDENTIAL_ID = 'openai-chatgpt'
const REFRESH_SKEW_MS = 5 * 60 * 1000

/**
 * Duck-typed BYOK store. `ByokClient` from `defineByok` matches this.
 */
export interface ChatGptByokStore {
  keys: () => Record<string, string | undefined>
  update: (provider: string, key: string) => void | Promise<void>
  clear: (provider?: string) => void | Promise<void>
}

export interface StartChatGptSignInOptions {
  /** Your app's name. OpenAI shows it on the consent screen. */
  agentName: string
  /** Defaults to `<origin>/auth/callback`. The host must be `127.0.0.1`. */
  redirectUri?: string
  navigate?: (url: string) => void
}

export interface CompleteChatGptSignInOptions {
  /** Defaults to `location.href`. */
  url?: string
  fetchImpl?: typeof fetch
}

export interface RefreshChatGptSignInOptions {
  fetchImpl?: typeof fetch
}

interface Pending {
  state: string
  nonce: string
  codeVerifier: string
  redirectUri: string
  clientId: string
}

interface HostRecord {
  hostId: string
  clientId?: string
}

interface Credential {
  clientId: string
  refreshToken: string
  expiresAt: number
}

/** A finished sign-in. Hold it in memory until you save it. */
export interface ChatGptSignIn extends Credential {
  accessToken: string
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  id_token?: string
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)))
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )
  return base64UrlEncode(new Uint8Array(digest))
}

function readJson(storage: Storage | undefined, key: string): unknown {
  const raw = storage?.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readHost(): HostRecord {
  const stored = readJson(globalThis.localStorage, HOST_STORAGE_KEY)
  if (isRecord(stored) && typeof stored.hostId === 'string') {
    return {
      hostId: stored.hostId,
      ...(typeof stored.clientId === 'string' && { clientId: stored.clientId }),
    }
  }
  // One stable id per browser profile, created before the first sign-in.
  const host = { hostId: `urn:uuid:${crypto.randomUUID()}` }
  globalThis.localStorage.setItem(HOST_STORAGE_KEY, JSON.stringify(host))
  return host
}

function readPending(): Pending | null {
  const stored = readJson(globalThis.sessionStorage, PENDING_STORAGE_KEY)
  if (!isRecord(stored)) return null
  const { state, nonce, codeVerifier, redirectUri, clientId } = stored
  if (
    typeof state !== 'string' ||
    typeof nonce !== 'string' ||
    typeof codeVerifier !== 'string' ||
    typeof redirectUri !== 'string' ||
    typeof clientId !== 'string'
  ) {
    return null
  }
  return { state, nonce, codeVerifier, redirectUri, clientId }
}

function readCredential(store: ChatGptByokStore): Credential | null {
  const raw = store.keys()[CREDENTIAL_ID]
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      isRecord(parsed) &&
      typeof parsed.clientId === 'string' &&
      typeof parsed.refreshToken === 'string' &&
      typeof parsed.expiresAt === 'number'
    ) {
      return {
        clientId: parsed.clientId,
        refreshToken: parsed.refreshToken,
        expiresAt: parsed.expiresAt,
      }
    }
  } catch {
    // fall through
  }
  return null
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) throw new Error('ChatGPT sign-in returned a malformed ID token')
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const parsed: unknown = JSON.parse(atob(base64))
  if (!isRecord(parsed)) {
    throw new Error('ChatGPT sign-in returned a malformed ID token')
  }
  return parsed
}

/**
 * The ID token comes straight from the token endpoint over TLS, so OIDC Core
 * 3.1.3.7 lets us skip the signature check. We still bind it to this attempt.
 */
function checkIdToken(idToken: string, clientId: string, nonce: string): void {
  const claims = decodeJwtPayload(idToken)
  const aud = claims.aud
  const audOk = Array.isArray(aud) ? aud.includes(clientId) : aud === clientId
  if (claims.iss !== ISSUER || !audOk || claims.nonce !== nonce) {
    throw new Error('ChatGPT sign-in returned an ID token for another request')
  }
}

class TokenRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function postToken(
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<TokenResponse> {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, resource: RESOURCE }).toString(),
  })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail =
      isRecord(data) && typeof data.error === 'string'
        ? data.error
        : `${response.status} ${response.statusText}`
    throw new TokenRequestError(
      `ChatGPT token request failed: ${detail}`,
      response.status,
    )
  }
  if (
    !isRecord(data) ||
    typeof data.access_token !== 'string' ||
    typeof data.refresh_token !== 'string' ||
    typeof data.expires_in !== 'number'
  ) {
    throw new Error('ChatGPT token response is missing tokens')
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    scope: typeof data.scope === 'string' ? data.scope : '',
    ...(typeof data.id_token === 'string' && { id_token: data.id_token }),
  }
}

function toSignIn(clientId: string, tokens: TokenResponse): ChatGptSignIn {
  return {
    clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  }
}

/**
 * Open the ChatGPT consent page. Call it from a click handler.
 *
 * The first sign-in registers a client for your app. Later sign-ins reuse the
 * client id saved in `localStorage`.
 */
export async function startChatGptSignIn(
  options: StartChatGptSignInOptions,
): Promise<void> {
  const redirectUri =
    options.redirectUri ?? `${globalThis.location.origin}${CALLBACK_PATH}`
  const redirect = new URL(redirectUri)
  if (
    redirect.hostname !== '127.0.0.1' ||
    redirect.pathname !== CALLBACK_PATH
  ) {
    throw new Error(
      `Sign in with ChatGPT needs a http://127.0.0.1:<port>${CALLBACK_PATH} redirect. Open the app on 127.0.0.1, not localhost.`,
    )
  }
  const host = readHost()
  const clientId = host.clientId ?? DYNAMIC_CLIENT_ID
  const pending: Pending = {
    state: randomToken(),
    nonce: randomToken(),
    codeVerifier: randomToken(),
    redirectUri,
    clientId,
  }
  globalThis.sessionStorage.setItem(
    PENDING_STORAGE_KEY,
    JSON.stringify(pending),
  )

  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId)
  if (clientId === DYNAMIC_CLIENT_ID) {
    url.searchParams.set('agent_name_hint', options.agentName)
  }
  url.searchParams.set('ext_agent_host_id', host.hostId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('resource', RESOURCE)
  url.searchParams.set('state', pending.state)
  url.searchParams.set('nonce', pending.nonce)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', await s256(pending.codeVerifier))

  const navigate =
    options.navigate ?? ((next: string) => globalThis.location.assign(next))
  navigate(url.toString())
}

/**
 * Finish the sign-in on your `/auth/callback` page: check the callback and
 * exchange the code. Pass the result to {@link saveChatGptSignIn}.
 *
 * Returns `null` when the URL is not a sign-in callback.
 */
export async function completeChatGptSignIn(
  options: CompleteChatGptSignInOptions = {},
): Promise<ChatGptSignIn | null> {
  const params = new URL(options.url ?? globalThis.location.href).searchParams
  const state = params.get('state')
  if (!state || (!params.has('code') && !params.has('error'))) return null

  const pending = readPending()
  if (!pending || pending.state !== state) {
    throw new Error('ChatGPT sign-in expired or did not start here. Try again.')
  }
  globalThis.sessionStorage.removeItem(PENDING_STORAGE_KEY)

  const error = params.get('error')
  if (error) {
    const description = params.get('error_description')
    throw new Error(
      `ChatGPT sign-in failed: ${description ? `${error}: ${description}` : error}`,
    )
  }

  const returnedClientId = params.get('client_id')
  let clientId = pending.clientId
  if (clientId === DYNAMIC_CLIENT_ID) {
    if (!returnedClientId) {
      throw new Error('ChatGPT sign-in did not return a client id')
    }
    clientId = returnedClientId
  } else if (returnedClientId && returnedClientId !== clientId) {
    throw new Error('ChatGPT sign-in returned a different client id')
  }

  const tokens = await postToken(
    {
      grant_type: 'authorization_code',
      client_id: clientId,
      code: params.get('code') ?? '',
      code_verifier: pending.codeVerifier,
      redirect_uri: pending.redirectUri,
    },
    options.fetchImpl ?? fetch,
  )
  if (!tokens.id_token) throw new Error('ChatGPT sign-in returned no ID token')
  checkIdToken(tokens.id_token, clientId, pending.nonce)
  if (!tokens.scope.split(' ').includes(PLAN_SCOPE)) {
    throw new Error('ChatGPT plan use was not allowed for this app')
  }

  globalThis.localStorage.setItem(
    HOST_STORAGE_KEY,
    JSON.stringify({ ...readHost(), clientId }),
  )
  return toSignIn(clientId, tokens)
}

/**
 * Save a sign-in into the BYOK keyring: the access token under `openai`, the
 * refresh credential in a slot that no send attaches. With passkey storage,
 * call it from a click handler, before any other `await`.
 */
export async function saveChatGptSignIn(
  store: ChatGptByokStore,
  signIn: ChatGptSignIn,
): Promise<void> {
  const { accessToken, ...credential } = signIn
  await store.update(CREDENTIAL_ID, JSON.stringify(credential))
  await store.update(openaiByok.id, accessToken)
}

const inFlight = new WeakMap<ChatGptByokStore, Promise<void>>()

/**
 * Refresh the ChatGPT access token when it expires in under five minutes.
 * Call it before each send. It does nothing when the user did not sign in
 * with ChatGPT or the keyring is locked.
 *
 * Refresh tokens rotate, so calls on the same store share one request.
 */
export function refreshChatGptSignIn(
  store: ChatGptByokStore,
  options: RefreshChatGptSignInOptions = {},
): Promise<void> {
  const running = inFlight.get(store)
  if (running) return running
  const next = refresh(store, options.fetchImpl ?? fetch).finally(() =>
    inFlight.delete(store),
  )
  inFlight.set(store, next)
  return next
}

async function refresh(
  store: ChatGptByokStore,
  fetchImpl: typeof fetch,
): Promise<void> {
  const credential = readCredential(store)
  if (!credential) return
  // The user removed the `openai` key: drop the refresh token too.
  if (!store.keys()[openaiByok.id]) {
    await store.clear(CREDENTIAL_ID)
    return
  }
  if (credential.expiresAt - Date.now() > REFRESH_SKEW_MS) return
  // ponytail: tabs do not coordinate. Two tabs refreshing at once lose one
  // rotation and that tab asks the user to sign in again.
  try {
    const tokens = await postToken(
      {
        grant_type: 'refresh_token',
        client_id: credential.clientId,
        refresh_token: credential.refreshToken,
      },
      fetchImpl,
    )
    await saveChatGptSignIn(store, toSignIn(credential.clientId, tokens))
  } catch (error) {
    // A rejected refresh token cannot recover. Clear both so the app asks the
    // user to sign in again. Network and server errors keep the credential.
    if (
      error instanceof TokenRequestError &&
      (error.status === 400 || error.status === 401)
    ) {
      await store.clear(CREDENTIAL_ID)
      await store.clear(openaiByok.id)
    }
    throw error
  }
}
