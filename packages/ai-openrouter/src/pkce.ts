import { openrouterByok } from './byok'

const AUTH_ORIGIN = 'https://openrouter.ai'
const AUTH_PATH = '/auth'
const KEYS_URL = `${AUTH_ORIGIN}/api/v1/auth/keys`
const PENDING_STORAGE_KEY = 'byok:openrouter:pkce:v1'
const VERIFIER_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
const SIGN_IN_TIMEOUT_MS = 10 * 60_000
const SIGNED_IN_PAGE =
  '<!doctype html><title>Signed in</title><p>You are signed in to OpenRouter. You can close this tab.</p>'
const SIGN_IN_FAILED_PAGE =
  '<!doctype html><title>Sign-in failed</title><p>OpenRouter sign-in failed. You can close this tab and try again.</p>'

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

export interface OpenRouterSignInOptions {
  /** How long to wait for the browser to come back. Default: 10 minutes. */
  timeoutMs?: number
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

function getSessionStorage() {
  if (typeof globalThis.sessionStorage === 'undefined') return null
  return globalThis.sessionStorage
}

function base64UrlEncode(bytes: Uint8Array) {
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

export function generateCodeVerifier(length = 64) {
  const size = Math.min(128, Math.max(43, length))
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  let out = ''
  for (const byte of bytes) {
    const ch = VERIFIER_CHARS[byte % VERIFIER_CHARS.length]
    out += ch ?? 'A'
  }
  return out
}

export async function createS256CodeChallenge(codeVerifier: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier),
  )
  return base64UrlEncode(new Uint8Array(digest))
}

export function buildOpenRouterAuthUrl(options: OpenRouterAuthUrlOptions) {
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

export function storeOpenRouterPkcePending(pending: OpenRouterPkcePending) {
  getSessionStorage()?.setItem(PENDING_STORAGE_KEY, JSON.stringify(pending))
}

export function loadOpenRouterPkcePending() {
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
    return {
      codeVerifier,
      codeChallengeMethod,
      callbackUrl,
    } satisfies OpenRouterPkcePending
  } catch {
    return null
  }
}

export function clearOpenRouterPkcePending() {
  getSessionStorage()?.removeItem(PENDING_STORAGE_KEY)
}

export function defaultOpenRouterCallbackUrl() {
  if (typeof globalThis.location === 'undefined') return ''
  return `${globalThis.location.origin}${globalThis.location.pathname}`
}

export async function startOpenRouterPkceLogin(
  options: StartOpenRouterPkceOptions = {},
) {
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
) {
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
  if (
    typeof data !== 'object' ||
    data === null ||
    !('key' in data) ||
    typeof data.key !== 'string' ||
    data.key.length === 0
  ) {
    throw new Error('OpenRouter PKCE exchange returned no key')
  }
  return data.key
}

export function stripOpenRouterCodeFromUrl(href?: string) {
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
) {
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
) {
  const key = await completeOpenRouterPkceFromUrl(options)
  if (!key) return null
  await byok.update(openrouterByok.id, key)
  return key
}

/**
 * OpenRouter sign-in for a local app, such as a CLI. The user signs in with a
 * browser and the app gets an API key (PKCE with S256), so nobody copies a
 * key by hand.
 *
 * The returned `signIn` starts a one-time listener on `127.0.0.1`, calls
 * `open` with the OpenRouter sign-in URL, and waits for the browser to come
 * back. Then it trades the code for a key and resolves with the key. The
 * listener closes when `signIn` settles. `signIn` rejects when the state does
 * not match, after `timeoutMs`, or when `signal` aborts.
 *
 * `node:http` loads only when `signIn` runs, so this module stays safe to
 * import in a browser.
 *
 * @example
 * const signIn = openrouterSignIn()
 * const key = await signIn({ open: (url) => console.log(`Open ${url}`) })
 */
export function openrouterSignIn(options: OpenRouterSignInOptions = {}) {
  return async (ctx: { open: (url: string) => void; signal?: AbortSignal }) => {
    const { createServer } = await import('node:http')
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await createS256CodeChallenge(codeVerifier)
    // OpenRouter sends back only `?code=`, so our state goes in the path.
    const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)))
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const callbackPath = `/callback/${state}`
    const callbackUrl = `http://127.0.0.1:${port}${callbackPath}`
    // Aborts when `signIn` settles: it stops the timer and the abort listener.
    const settled = new AbortController()
    try {
      const code = await new Promise<string>((resolve, reject) => {
        const { signal } = ctx
        if (signal?.aborted) {
          reject(signal.reason)
          return
        }
        signal?.addEventListener('abort', () => reject(signal.reason), {
          signal: settled.signal,
        })
        const timer = setTimeout(
          () => reject(new Error('OpenRouter sign-in timed out.')),
          options.timeoutMs ?? SIGN_IN_TIMEOUT_MS,
        )
        settled.signal.addEventListener('abort', () => clearTimeout(timer))
        server.on('request', (req, res) => {
          const url = new URL(req.url ?? '/', callbackUrl)
          if (!url.pathname.startsWith('/callback/')) {
            res.writeHead(404).end()
            return
          }
          const hasState = url.pathname === callbackPath
          const returnedCode = url.searchParams.get('code')
          const isSignedIn = hasState && Boolean(returnedCode)
          res
            .writeHead(isSignedIn ? 200 : 400, {
              'content-type': 'text/html; charset=utf-8',
              // The browser does not keep the connection, so the listener can close.
              connection: 'close',
            })
            .end(isSignedIn ? SIGNED_IN_PAGE : SIGN_IN_FAILED_PAGE)
          if (!hasState) {
            reject(
              new Error('OpenRouter sign-in failed: the state does not match.'),
            )
          } else if (!returnedCode) {
            reject(
              new Error('OpenRouter sign-in failed: the callback has no code.'),
            )
          } else resolve(returnedCode)
        })
        ctx.open(
          buildOpenRouterAuthUrl({
            callbackUrl,
            codeChallenge,
            codeChallengeMethod: 'S256',
          }),
        )
      })
      return await exchangeOpenRouterCode({
        code,
        codeVerifier,
        codeChallengeMethod: 'S256',
        fetchImpl: options.fetchImpl,
      })
    } finally {
      settled.abort()
      server.close()
      server.closeIdleConnections()
    }
  }
}
