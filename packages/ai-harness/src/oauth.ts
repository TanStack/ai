import { base64url } from './utils'
import type { Credential } from '@tanstack/ai/byok'

/** An OAuth 2 app: where to send the user, and where to get tokens. */
export interface OAuthConfig {
  authorizationUrl: string
  tokenUrl: string
  /** The device authorization endpoint (RFC 8628), for logins without a browser here. */
  deviceUrl?: string
  clientId: string
  /** Only for confidential clients. A CLI is a public client and has none. */
  clientSecret?: string
  scopes?: ReadonlyArray<string>
  /**
   * The issuer of the authorization server. When the server sends `iss` with
   * the code (RFC 9207), `loopbackLogin` refuses a code from another issuer.
   */
  issuer?: string
}

type Fetch = typeof fetch

const encoder = new TextEncoder()

function randomString(bytes = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

/**
 * Resolve after `ms`, or at once when `signal` aborts. The timer is not
 * unref'd: it is the wait of a device sign-in, and a script that only waits
 * for that sign-in must not exit.
 */
function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
  })
}

/** A PKCE pair with the S256 method (RFC 7636). */
export async function createPkce() {
  const verifier = randomString(32)
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier))
  return { verifier, challenge: base64url(new Uint8Array(digest)) }
}

/** The URL that starts a browser sign-in. */
export function buildAuthorizationUrl(
  config: OAuthConfig,
  options: { redirectUri: string; state: string; challenge: string },
) {
  const url = new URL(config.authorizationUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', options.redirectUri)
  url.searchParams.set('state', options.state)
  url.searchParams.set('code_challenge', options.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  if (config.scopes?.length)
    url.searchParams.set('scope', config.scopes.join(' '))
  return url.toString()
}

async function tokenRequest(
  config: OAuthConfig,
  body: Record<string, string>,
  options: { fetch?: Fetch; signal?: AbortSignal },
) {
  const doFetch = options.fetch ?? fetch
  const response = await doFetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
      ...body,
    }),
    signal: options.signal,
  })
  const parsed: unknown = await response.json().catch(() => ({}))
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`OAuth token request failed (${response.status}).`)
  }
  // An OAuth token endpoint answers with a flat JSON object.
  return parsed as Record<string, unknown>
}

function credentialFrom(
  response: Record<string, unknown>,
  previous?: Credential,
): Credential {
  if (typeof response.access_token !== 'string') {
    const reason =
      typeof response.error === 'string' ? response.error : 'no access_token'
    throw new Error(`OAuth token request failed: ${reason}`)
  }
  const refreshToken =
    typeof response.refresh_token === 'string'
      ? response.refresh_token
      : previous?.type === 'oauth'
        ? previous.refreshToken
        : undefined
  return {
    type: 'oauth',
    accessToken: response.access_token,
    ...(refreshToken ? { refreshToken } : {}),
    ...(typeof response.expires_in === 'number'
      ? { expiresAt: Date.now() + response.expires_in * 1000 }
      : {}),
    ...(typeof response.scope === 'string'
      ? { scopes: response.scope.split(/[ ,]/).filter(Boolean) }
      : {}),
    // A refresh keeps the client the tokens belong to: the next refresh
    // needs it too.
    ...(previous?.type === 'oauth' && previous.client
      ? { client: previous.client }
      : {}),
  }
}

/**
 * Trade an authorization code for tokens. When `signal` aborts, the request
 * stops and the call rejects with the reason of the signal.
 */
export async function exchangeCode(
  config: OAuthConfig,
  options: {
    code: string
    verifier: string
    redirectUri: string
    fetch?: Fetch
    signal?: AbortSignal
  },
) {
  const response = await tokenRequest(
    config,
    {
      grant_type: 'authorization_code',
      code: options.code,
      code_verifier: options.verifier,
      redirect_uri: options.redirectUri,
    },
    options,
  )
  return credentialFrom(response)
}

/** True when an OAuth credential expires within `skewMs`. */
export function isExpired(credential: Credential, skewMs = 60_000) {
  return (
    credential.type === 'oauth' &&
    credential.expiresAt !== undefined &&
    credential.expiresAt - skewMs <= Date.now()
  )
}

/**
 * Get a new access token with the refresh token. `fetch` replaces the global
 * `fetch`. When `signal` aborts, the request stops and the call rejects with
 * the reason of the signal.
 *
 * @example
 * ```ts
 * const fresh = await refreshCredential(config, credential, { signal })
 * ```
 */
export async function refreshCredential(
  config: OAuthConfig,
  credential: Credential,
  options: { fetch?: Fetch; signal?: AbortSignal } = {},
) {
  if (credential.type !== 'oauth' || !credential.refreshToken) {
    throw new Error('This credential has no refresh token.')
  }
  const response = await tokenRequest(
    config,
    { grant_type: 'refresh_token', refresh_token: credential.refreshToken },
    options,
  )
  return credentialFrom(response, credential)
}

const DONE_PAGE =
  '<!doctype html><title>Signed in</title><p>You are signed in. You can close this tab.</p>'

/**
 * A one-time receiver for an OAuth redirect on `127.0.0.1` (RFC 8252). Use it
 * when another library runs the OAuth flow and you only need the code back:
 * register `redirectUri`, send the user to the authorization URL, then await
 * `waitForCode(state)`. It answers one callback, then stops listening.
 *
 * `waitForCode` resolves with the code and the `iss` the server sent with it
 * (RFC 9207). Pass `iss` on to the library: a server that sends it can refuse
 * a code without it.
 *
 * A request to the callback path with no `code` and no `state` gets a 400,
 * and the sign-in goes on. `close()` stops listening, and a `waitForCode`
 * that waits rejects. When `signal` aborts, the receiver closes, and
 * `waitForCode` rejects with the reason of the signal.
 *
 * @example
 * ```ts
 * const receiver = await startLoopbackReceiver({ signal })
 * try {
 *   // Register receiver.redirectUri, then send the user to the sign-in page.
 *   const { code, iss } = await receiver.waitForCode(state)
 * } finally {
 *   receiver.close()
 * }
 * ```
 */
export async function startLoopbackReceiver(
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
) {
  const { signal } = options
  const { createServer } = await import('node:http')
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  if (signal?.aborted) {
    server.close()
    throw signal.reason
  }
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const redirectUri = `http://127.0.0.1:${port}/callback`
  let timer: ReturnType<typeof setTimeout> | undefined
  /** Rejects the `waitForCode` that waits. */
  let fail: (error: unknown) => void = () => {}
  /** Stop listening. With `error`, a `waitForCode` that waits rejects. */
  const stop = (error?: unknown) => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    server.closeAllConnections()
    server.close()
    if (error !== undefined) fail(error)
  }
  const onAbort = () => stop(signal?.reason)
  signal?.addEventListener('abort', onAbort, { once: true })
  return {
    redirectUri,
    close: () => stop(new Error('Sign-in cancelled.')),
    waitForCode: (state: string) =>
      new Promise<{ code: string; iss?: string }>((resolve, reject) => {
        if (!server.listening) {
          reject(
            signal?.aborted ? signal.reason : new Error('Sign-in cancelled.'),
          )
          return
        }
        fail = reject
        timer = setTimeout(
          () => stop(new Error('Sign-in timed out.')),
          options.timeoutMs ?? 10 * 60_000,
        )
        // The deadline must not keep a CLI or a test process alive.
        if (typeof timer === 'object' && 'unref' in timer) timer.unref()
        server.on('request', (req, res) => {
          const url = new URL(req.url ?? '/', redirectUri)
          if (url.pathname !== '/callback') {
            res.writeHead(404).end()
            return
          }
          const params = url.searchParams
          const code = params.get('code')
          const returnedState = params.get('state')
          // Not an answer of the server, for example a reload or a probe.
          if (code === null && returnedState === null) {
            res.writeHead(400).end()
            return
          }
          res.writeHead(200, { 'Content-Type': 'text/html' }).end(DONE_PAGE)
          const iss = params.get('iss')
          if (returnedState !== state) {
            stop(new Error('Sign-in failed: the state does not match.'))
          } else if (!code) {
            stop(
              new Error(`Sign-in failed: ${params.get('error') ?? 'no code'}`),
            )
          } else {
            resolve(iss ? { code, iss } : { code })
            stop()
          }
        })
      }),
  }
}

/**
 * Sign in through the browser with a loopback redirect (RFC 8252 + PKCE).
 * Listens on `127.0.0.1` on a random port, for one callback only. Calls
 * `onUrl` with the URL to open. Resolves with the tokens.
 *
 * When the server sends `iss` with the code (RFC 9207) and `config.issuer`
 * is set, they must be the same. When `signal` aborts, the sign-in stops at
 * once, stops listening, and rejects with the reason of the signal.
 *
 * @example
 * ```ts
 * const credential = await loopbackLogin(config, {
 *   onUrl: (url) => console.log(`Open ${url}`),
 *   signal,
 * })
 * ```
 */
export async function loopbackLogin(
  config: OAuthConfig,
  options: {
    onUrl: (url: string) => void
    fetch?: Fetch
    timeoutMs?: number
    signal?: AbortSignal
  },
) {
  const { verifier, challenge } = await createPkce()
  const state = randomString(16)
  const receiver = await startLoopbackReceiver(options)
  const { redirectUri } = receiver
  try {
    options.onUrl(
      buildAuthorizationUrl(config, { redirectUri, state, challenge }),
    )
    const { code, iss } = await receiver.waitForCode(state)
    const isOtherIssuer =
      iss !== undefined && config.issuer !== undefined && iss !== config.issuer
    if (isOtherIssuer) {
      throw new Error('Sign-in failed: the issuer does not match.')
    }
    return await exchangeCode(config, {
      code,
      verifier,
      redirectUri,
      fetch: options.fetch,
      signal: options.signal,
    })
  } finally {
    receiver.close()
  }
}

/**
 * Sign in with a device code (RFC 8628), for SSH sessions, containers, and
 * CI. Calls `onCode` with the code and the page to enter it on, then polls.
 * It waits the interval the server asks for, at least 1 second. When
 * `signal` aborts, it stops polling at once and rejects with the reason of
 * the signal.
 *
 * @example
 * ```ts
 * const credential = await deviceLogin(config, {
 *   onCode: ({ userCode, verificationUri }) =>
 *     console.log(`Enter ${userCode} at ${verificationUri}`),
 *   signal,
 * })
 * ```
 */
export async function deviceLogin(
  config: OAuthConfig,
  options: {
    /** `expiresAt`: when the code expires, in epoch milliseconds. */
    onCode: (info: {
      userCode: string
      verificationUri: string
      expiresAt: number
    }) => void
    fetch?: Fetch
    signal?: AbortSignal
    /**
     * Test hook. Default waits `ms`, and ends early when `signal` aborts.
     */
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  },
) {
  if (!config.deviceUrl)
    throw new Error('This OAuth app has no device endpoint.')
  const { signal } = options
  const doFetch = options.fetch ?? fetch
  const sleep = options.sleep ?? wait
  const started = await doFetch(config.deviceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      ...(config.scopes?.length ? { scope: config.scopes.join(' ') } : {}),
    }),
    signal,
  })
  const device: unknown = await started.json()
  if (
    typeof device !== 'object' ||
    device === null ||
    !('device_code' in device) ||
    typeof device.device_code !== 'string' ||
    !('user_code' in device) ||
    typeof device.user_code !== 'string'
  ) {
    throw new Error('Device sign-in failed: the server sent no device code.')
  }
  const verificationUri =
    'verification_uri' in device && typeof device.verification_uri === 'string'
      ? device.verification_uri
      : config.authorizationUrl
  // 5 seconds when the server names no interval (RFC 8628 section 3.5). At
  // least 1 second, so a server that sends 0 gets no tight loop.
  let interval =
    'interval' in device && typeof device.interval === 'number'
      ? Math.max(device.interval, 1) * 1000
      : 5000
  const expiresAt =
    Date.now() +
    ('expires_in' in device && typeof device.expires_in === 'number'
      ? device.expires_in * 1000
      : 15 * 60_000)
  options.onCode({ userCode: device.user_code, verificationUri, expiresAt })

  while (Date.now() < expiresAt) {
    await sleep(interval, signal)
    signal?.throwIfAborted()
    const response = await tokenRequest(
      config,
      {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: device.device_code,
      },
      options,
    )
    if (response.error === 'authorization_pending') continue
    if (response.error === 'slow_down') {
      interval += 5000
      continue
    }
    return credentialFrom(response)
  }
  throw new Error('Device sign-in expired.')
}
