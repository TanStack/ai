/**
 * OpenRouter OAuth PKCE — one-click login that yields a user-controlled API key.
 *
 * Flow (https://openrouter.ai/docs/guides/overview/auth/oauth):
 * 1. Redirect the user to `openrouter.ai/auth` with `callback_url` and optional
 *    S256 `code_challenge`.
 * 2. OpenRouter redirects back with a `code` query param.
 * 3. POST the code (and `code_verifier` when a challenge was used) to
 *    `/api/v1/auth/keys` to receive `{ key }`.
 *
 * The returned key is stored via `setKey('openrouter', key)` in the configured
 * keyring (passkey by default via {@link defaultByokStorage}).
 */

const AUTH_ORIGIN = 'https://openrouter.ai'
const AUTH_PATH = '/auth'
const KEYS_URL = `${AUTH_ORIGIN}/api/v1/auth/keys`
const PENDING_STORAGE_KEY = 'byok:openrouter:pkce:v1'

export type OpenRouterPkceChallengeMethod = 'S256' | 'plain'

/** Pending PKCE state between the outbound redirect and the callback. */
export interface OpenRouterPkcePending {
  codeVerifier: string
  codeChallengeMethod: OpenRouterPkceChallengeMethod
  callbackUrl: string
}

export interface OpenRouterAuthUrlOptions {
  /** Where OpenRouter redirects after authorization (your app URL). */
  callbackUrl: string
  /** S256 challenge (recommended). Omit for no PKCE challenge. */
  codeChallenge?: string
  codeChallengeMethod?: OpenRouterPkceChallengeMethod
}

export interface StartOpenRouterPkceOptions {
  callbackUrl: string
  /**
   * Use S256 PKCE (recommended). When `false`, no challenge is sent — OpenRouter
   * still returns a code, but the exchange omits verifier fields.
   */
  useS256?: boolean
  /** Override `window.location.assign` (for tests). */
  navigate?: (url: string) => void
}

export interface ExchangeOpenRouterCodeOptions {
  code: string
  codeVerifier?: string
  codeChallengeMethod?: OpenRouterPkceChallengeMethod
  fetchImpl?: typeof fetch
}

export interface CompleteOpenRouterPkceFromUrlOptions {
  /** Defaults to `window.location.href`. */
  url?: string
  fetchImpl?: typeof fetch
  /** Clear pending session state after a successful exchange. Default `true`. */
  clearPending?: boolean
  /** Strip `code` from the browser URL after success. Default `true` in browser. */
  cleanUrl?: boolean
}

const VERIFIER_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

/** URL-safe random string for PKCE `code_verifier` (RFC 7636). */
export function generateCodeVerifier(length = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (let i = 0; i < length; i++) {
    out += VERIFIER_CHARS[(bytes[i] ?? 0) % VERIFIER_CHARS.length]
  }
  return out
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** S256 `code_challenge` from a `code_verifier` (base64url-encoded SHA-256). */
export async function createS256CodeChallenge(
  codeVerifier: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier),
  )
  return base64UrlEncode(new Uint8Array(digest))
}

/** Build the OpenRouter `/auth` URL that starts the PKCE redirect. */
export function buildOpenRouterAuthUrl(
  options: OpenRouterAuthUrlOptions,
): string {
  const url = new URL(AUTH_PATH, AUTH_ORIGIN)
  url.searchParams.set('callback_url', options.callbackUrl)
  if (options.codeChallenge) {
    url.searchParams.set('code_challenge', options.codeChallenge)
    url.searchParams.set(
      'code_challenge_method',
      options.codeChallengeMethod ?? 'S256',
    )
  }
  return url.toString()
}

function sessionStorage(): Storage | null {
  if (typeof globalThis.sessionStorage === 'undefined') return null
  return globalThis.sessionStorage
}

/** Persist pending PKCE state until the callback completes. */
export function storeOpenRouterPkcePending(
  pending: OpenRouterPkcePending,
): void {
  sessionStorage()?.setItem(PENDING_STORAGE_KEY, JSON.stringify(pending))
}

/** Read pending PKCE state, or `null` when absent or corrupt. */
export function loadOpenRouterPkcePending(): OpenRouterPkcePending | null {
  const raw = sessionStorage()?.getItem(PENDING_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { codeVerifier, codeChallengeMethod, callbackUrl } = parsed as {
      codeVerifier?: unknown
      codeChallengeMethod?: unknown
      callbackUrl?: unknown
    }
    if (
      typeof codeVerifier !== 'string' ||
      (codeChallengeMethod !== 'S256' && codeChallengeMethod !== 'plain') ||
      typeof callbackUrl !== 'string'
    ) {
      return null
    }
    return { codeVerifier, codeChallengeMethod, callbackUrl }
  } catch {
    return null
  }
}

export function clearOpenRouterPkcePending(): void {
  sessionStorage()?.removeItem(PENDING_STORAGE_KEY)
}

/**
 * Default callback URL: current origin + pathname (no query/hash). Suitable for
 * SPAs where OpenRouter appends `?code=…` on return.
 */
export function defaultOpenRouterCallbackUrl(): string {
  if (typeof globalThis.location === 'undefined') return ''
  return `${globalThis.location.origin}${globalThis.location.pathname}`
}

/**
 * Start the OpenRouter PKCE login: generate verifier, store pending state, and
 * redirect the browser to OpenRouter's `/auth` page.
 */
export async function startOpenRouterPkceLogin(
  options: StartOpenRouterPkceOptions,
): Promise<void> {
  const useS256 = options.useS256 !== false
  const codeVerifier = generateCodeVerifier()
  const codeChallengeMethod: OpenRouterPkceChallengeMethod = useS256
    ? 'S256'
    : 'plain'

  let codeChallenge: string | undefined
  if (useS256) {
    codeChallenge = await createS256CodeChallenge(codeVerifier)
  }

  storeOpenRouterPkcePending({
    codeVerifier,
    codeChallengeMethod,
    callbackUrl: options.callbackUrl,
  })

  const authUrl = buildOpenRouterAuthUrl({
    callbackUrl: options.callbackUrl,
    codeChallenge,
    codeChallengeMethod: useS256 ? 'S256' : undefined,
  })

  const navigate =
    options.navigate ??
    ((url: string) => {
      globalThis.location.assign(url)
    })
  navigate(authUrl)
}

/**
 * Exchange an authorization `code` for a user-controlled OpenRouter API key.
 */
export async function exchangeOpenRouterCode(
  options: ExchangeOpenRouterCodeOptions,
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch
  const body: Record<string, string> = { code: options.code }
  if (options.codeVerifier) {
    body.code_verifier = options.codeVerifier
    if (options.codeChallengeMethod) {
      body.code_challenge_method = options.codeChallengeMethod
    }
  }

  const response = await fetchImpl(KEYS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const err: unknown = await response.json()
      if (typeof err === 'object' && err !== null && 'error' in err) {
        detail = String(err.error)
      }
    } catch {
      // use status line
    }
    throw new Error(`OpenRouter PKCE exchange failed: ${detail}`)
  }

  const data: unknown = await response.json()
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as { key?: unknown }).key !== 'string' ||
    !(data as { key: string }).key
  ) {
    throw new Error('OpenRouter PKCE exchange returned no key')
  }
  return (data as { key: string }).key
}

/** Remove `code` from the current URL without reloading. */
export function stripOpenRouterCodeFromUrl(href?: string): void {
  if (typeof globalThis.history === 'undefined') return
  const base = href ?? globalThis.location.href
  const url = new URL(base)
  if (!url.searchParams.has('code')) return
  url.searchParams.delete('code')
  const next = `${url.pathname}${url.search}${url.hash}`
  globalThis.history.replaceState({}, '', next)
}

/**
 * If the current URL carries an OpenRouter `code` and pending PKCE state exists,
 * exchange the code for an API key. Returns `null` when there is nothing to
 * complete (no code, or no pending verifier).
 */
export async function completeOpenRouterPkceFromUrl(
  options: CompleteOpenRouterPkceFromUrlOptions = {},
): Promise<string | null> {
  const href =
    options.url ??
    (typeof globalThis.location !== 'undefined' ? globalThis.location.href : '')
  if (!href) return null

  const code = new URL(href).searchParams.get('code')
  if (!code) return null

  const pending = loadOpenRouterPkcePending()
  if (!pending) {
    throw new Error(
      'OpenRouter authorization code present but PKCE session expired — try signing in again',
    )
  }

  const key = await exchangeOpenRouterCode({
    code,
    codeVerifier: pending.codeVerifier,
    codeChallengeMethod: pending.codeChallengeMethod,
    fetchImpl: options.fetchImpl,
  })

  if (options.clearPending !== false) clearOpenRouterPkcePending()
  if (options.cleanUrl !== false) stripOpenRouterCodeFromUrl(href)

  return key
}
