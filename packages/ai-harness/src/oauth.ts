import type { Credential } from '@tanstack/ai-persistence'

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
}

type Fetch = typeof fetch

const encoder = new TextEncoder()

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

/** A PKCE pair with the S256 method (RFC 7636). */
export async function createPkce(): Promise<{
  verifier: string
  challenge: string
}> {
  const verifier = randomString(32)
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier))
  return { verifier, challenge: base64url(new Uint8Array(digest)) }
}

/** The URL that starts a browser sign-in. */
export function buildAuthorizationUrl(
  config: OAuthConfig,
  options: { redirectUri: string; state: string; challenge: string },
): string {
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
  doFetch: Fetch,
): Promise<Record<string, unknown>> {
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
  }
}

/** Trade an authorization code for tokens. */
export async function exchangeCode(
  config: OAuthConfig,
  options: {
    code: string
    verifier: string
    redirectUri: string
    fetch?: Fetch
  },
): Promise<Credential> {
  const response = await tokenRequest(
    config,
    {
      grant_type: 'authorization_code',
      code: options.code,
      code_verifier: options.verifier,
      redirect_uri: options.redirectUri,
    },
    options.fetch ?? fetch,
  )
  return credentialFrom(response)
}

/** True when an OAuth credential expires within `skewMs`. */
export function isExpired(credential: Credential, skewMs = 60_000): boolean {
  return (
    credential.type === 'oauth' &&
    credential.expiresAt !== undefined &&
    credential.expiresAt - skewMs <= Date.now()
  )
}

/** Get a new access token with the refresh token. */
export async function refreshCredential(
  config: OAuthConfig,
  credential: Credential,
  doFetch: Fetch = fetch,
): Promise<Credential> {
  if (credential.type !== 'oauth' || !credential.refreshToken) {
    throw new Error('This credential has no refresh token.')
  }
  const response = await tokenRequest(
    config,
    { grant_type: 'refresh_token', refresh_token: credential.refreshToken },
    doFetch,
  )
  return credentialFrom(response, credential)
}

const DONE_PAGE =
  '<!doctype html><title>Signed in</title><p>You are signed in. You can close this tab.</p>'

/**
 * Sign in through the browser with a loopback redirect (RFC 8252 + PKCE).
 * Listens on `127.0.0.1` on a random port, for one callback only. Calls
 * `onUrl` with the URL to open. Resolves with the tokens.
 */
export async function loopbackLogin(
  config: OAuthConfig,
  options: { onUrl: (url: string) => void; fetch?: Fetch; timeoutMs?: number },
): Promise<Credential> {
  const { createServer } = await import('node:http')
  const { verifier, challenge } = await createPkce()
  const state = randomString(16)
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const redirectUri = `http://127.0.0.1:${port}/callback`

  try {
    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Sign-in timed out.')),
        options.timeoutMs ?? 10 * 60_000,
      )
      server.on('request', (req, res) => {
        const url = new URL(req.url ?? '/', redirectUri)
        if (url.pathname !== '/callback') {
          res.writeHead(404).end()
          return
        }
        clearTimeout(timer)
        const returnedState = url.searchParams.get('state')
        const returnedCode = url.searchParams.get('code')
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(DONE_PAGE)
        if (returnedState !== state)
          reject(new Error('Sign-in failed: the state does not match.'))
        else if (!returnedCode) {
          reject(
            new Error(
              `Sign-in failed: ${url.searchParams.get('error') ?? 'no code'}`,
            ),
          )
        } else resolve(returnedCode)
      })
      options.onUrl(
        buildAuthorizationUrl(config, { redirectUri, state, challenge }),
      )
    })
    return await exchangeCode(config, {
      code,
      verifier,
      redirectUri,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })
  } finally {
    server.closeAllConnections()
    server.close()
  }
}

/**
 * Sign in with a device code (RFC 8628), for SSH sessions, containers, and
 * CI. Calls `onCode` with the code and the page to enter it on, then polls.
 */
export async function deviceLogin(
  config: OAuthConfig,
  options: {
    onCode: (info: { userCode: string; verificationUri: string }) => void
    fetch?: Fetch
    /** Test hook. Default waits the interval the server asks for. */
    sleep?: (ms: number) => Promise<void>
  },
): Promise<Credential> {
  if (!config.deviceUrl)
    throw new Error('This OAuth app has no device endpoint.')
  const doFetch = options.fetch ?? fetch
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
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
  let interval =
    'interval' in device && typeof device.interval === 'number'
      ? device.interval * 1000
      : 5000
  const expiresAt =
    Date.now() +
    ('expires_in' in device && typeof device.expires_in === 'number'
      ? device.expires_in * 1000
      : 15 * 60_000)
  options.onCode({ userCode: device.user_code, verificationUri })

  while (Date.now() < expiresAt) {
    await sleep(interval)
    const response = await tokenRequest(
      config,
      {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: device.device_code,
      },
      doFetch,
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
