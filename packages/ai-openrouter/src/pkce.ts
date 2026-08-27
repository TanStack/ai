import { openrouterByok } from './byok'

const AUTH_ORIGIN = 'https://openrouter.ai'
const AUTH_PATH = '/auth'
const KEYS_URL = `${AUTH_ORIGIN}/api/v1/auth/keys`
const PENDING_STORAGE_KEY = 'byok:openrouter:pkce:v1'
const VERIFIER_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

export type OpenRouterPkceChallengeMethod = 'S256'

export interface OpenRouterPkcePending {
  codeVerifier: string
  codeChallengeMethod: OpenRouterPkceChallengeMethod
  callbackUrl: string
}

export interface OpenRouterAuthUrlOptions {
  callbackUrl: string
  codeChallenge?: string
  codeChallengeMethod?: OpenRouterPkceChallengeMethod
}

export interface StartOpenRouterPkceOptions {
  callbackUrl?: string
  navigate?: (url: string) => void
}

export interface ExchangeOpenRouterCodeOptions {
  code: string
  codeVerifier?: string
  codeChallengeMethod?: OpenRouterPkceChallengeMethod
  fetchImpl?: typeof fetch
}

export interface CompleteOpenRouterPkceFromUrlOptions {
  url?: string
  fetchImpl?: typeof fetch
  clearPending?: boolean
  cleanUrl?: boolean
}

/**
 * Duck-typed BYOK store. `ByokClient.update` matches this. The slug is always
 * {@link openrouterByok.id}.
 */
export interface OpenRouterByokStore {
  update: (provider: string, key: string) => void | Promise<void>
}

function getSessionStorage(): Storage | null {
  if (typeof globalThis.sessionStorage === 'undefined') return null
  return globalThis.sessionStorage
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64')
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateCodeVerifier(length = 64): string {
  const size = Math.min(128, Math.max(43, length))
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  let out = ''
  for (const byte of bytes) {
    const ch = VERIFIER_CHARS[byte % VERIFIER_CHARS.length]
    out += ch ?? 'A'
  }
  return out
}

export async function createS256CodeChallenge(
  codeVerifier: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier),
  )
  return base64UrlEncode(new Uint8Array(digest))
}

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

export function storeOpenRouterPkcePending(
  pending: OpenRouterPkcePending,
): void {
  getSessionStorage()?.setItem(PENDING_STORAGE_KEY, JSON.stringify(pending))
}

export function loadOpenRouterPkcePending(): OpenRouterPkcePending | null {
  const raw = getSessionStorage()?.getItem(PENDING_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    if (!('codeVerifier' in parsed) || !('codeChallengeMethod' in parsed)) {
      return null
    }
    if (!('callbackUrl' in parsed)) return null
    const { codeVerifier, codeChallengeMethod, callbackUrl } = parsed
    if (typeof codeVerifier !== 'string') return null
    if (codeChallengeMethod !== 'S256') return null
    if (typeof callbackUrl !== 'string') return null
    return { codeVerifier, codeChallengeMethod, callbackUrl }
  } catch {
    return null
  }
}

export function clearOpenRouterPkcePending(): void {
  getSessionStorage()?.removeItem(PENDING_STORAGE_KEY)
}

export function defaultOpenRouterCallbackUrl(): string {
  if (typeof globalThis.location === 'undefined') return ''
  return `${globalThis.location.origin}${globalThis.location.pathname}`
}

export async function startOpenRouterPkceLogin(
  options: StartOpenRouterPkceOptions = {},
): Promise<void> {
  const callbackUrl = options.callbackUrl ?? defaultOpenRouterCallbackUrl()
  if (!callbackUrl) {
    throw new Error('OpenRouter PKCE login requires a callbackUrl')
  }
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await createS256CodeChallenge(codeVerifier)
  storeOpenRouterPkcePending({
    codeVerifier,
    codeChallengeMethod: 'S256',
    callbackUrl,
  })
  const authUrl = buildOpenRouterAuthUrl({
    callbackUrl,
    codeChallenge,
    codeChallengeMethod: 'S256',
  })
  const navigate =
    options.navigate ??
    ((url) => {
      globalThis.location.assign(url)
    })
  navigate(authUrl)
}

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
      // keep status text
    }
    throw new Error(`OpenRouter PKCE exchange failed: ${detail}`)
  }
  const data: unknown = await response.json()
  const hasNoKey =
    typeof data !== 'object' ||
    data === null ||
    !('key' in data) ||
    typeof (data as { key: unknown }).key !== 'string' ||
    (data as { key: string }).key.length === 0
  if (hasNoKey) {
    throw new Error('OpenRouter PKCE exchange returned no key')
  }
  return (data as { key: string }).key
}

export function stripOpenRouterCodeFromUrl(href?: string): void {
  if (typeof globalThis.history === 'undefined') return
  const base = href ?? globalThis.location.href
  const url = new URL(base)
  if (!url.searchParams.has('code')) return
  url.searchParams.delete('code')
  const next = `${url.pathname}${url.search}${url.hash}`
  globalThis.history.replaceState({}, '', next)
}

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

/**
 * Finish the OpenRouter PKCE callback and save the key under
 * {@link openrouterByok.id}.
 */
export async function completeOpenRouterPkceIntoByok(
  byok: OpenRouterByokStore,
  options: CompleteOpenRouterPkceFromUrlOptions = {},
): Promise<string | null> {
  const key = await completeOpenRouterPkceFromUrl(options)
  if (!key) return null
  await byok.update(openrouterByok.id, key)
  return key
}
