import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server'
import type { AuthInfo, OAuthTokenVerifier } from '@modelcontextprotocol/server'
import { createRemoteJWKSet, customFetch, errors, jwtVerify } from 'jose'

/**
 * Options for {@link jwtVerifier}.
 * `issuer` and `audience` are required. A token for another issuer or
 * another API must not call this server.
 */
export type JwtVerifierOptions = {
  /** The JWKS URL of the authorization server. */
  jwksUrl: string
  /** The `iss` claim the token must carry. */
  issuer: string
  /** The `aud` claim the token must carry. Usually this MCP server URL. */
  audience: string
  /** Accepted JWS algorithms. The default accepts what the key set advertises. */
  algorithms?: Array<string>
  /** Fetch for the JWKS request. The default is the global `fetch`. */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
}

/**
 * Options for {@link introspectionVerifier}.
 * The server sends the token to `introspectionUrl` with HTTP Basic auth.
 */
export type IntrospectionVerifierOptions = {
  /** The RFC 7662 introspection endpoint of the authorization server. */
  introspectionUrl: string
  /** The client id this MCP server uses at the authorization server. */
  clientId: string
  /** The client secret for `clientId`. */
  clientSecret: string
  /** Fetch for the introspection request. The default is the global `fetch`. */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
}

/**
 * Builds an `OAuthTokenVerifier` for a JWT access token.
 *
 * The verifier reads the keys from `jwksUrl`, caches them, and checks the
 * signature, `iss`, `aud`, `exp`, and `nbf` with `jose`.
 * A token that fails any check gets a 401 from `createMCPServer`.
 * When the key set cannot be read, the caller gets a 500 `server_error`,
 * so a provider outage does not look like a bad token.
 *
 * `clientId` on the result is the `client_id`, `azp`, or `sub` claim.
 * `scopes` comes from the `scope` claim. `extra` holds every claim,
 * so a tool can read `ctx.context.authInfo.extra.sub`.
 *
 * @param options - The JWKS URL, the issuer, and the audience
 *
 * @example
 * ```ts
 * const server = createMCPServer({
 *   name: 'notes',
 *   version: '1.0.0',
 *   auth: {
 *     verifier: jwtVerifier({
 *       jwksUrl: 'https://auth.example.com/.well-known/jwks.json',
 *       issuer: 'https://auth.example.com/',
 *       audience: 'https://mcp.example.com/mcp',
 *     }),
 *   },
 * })
 * ```
 */
export function jwtVerifier(options: JwtVerifierOptions): OAuthTokenVerifier {
  const fetchImpl = options.fetch
  const keys = createRemoteJWKSet(new URL(options.jwksUrl), {
    ...(fetchImpl === undefined ? {} : { [customFetch]: fetchImpl }),
  })
  return {
    async verifyAccessToken(token) {
      let claims: Record<string, unknown>
      try {
        const verified = await jwtVerify(token, keys, {
          issuer: options.issuer,
          audience: options.audience,
          algorithms: options.algorithms,
        })
        claims = verified.payload
      } catch (error) {
        if (isTokenError(error)) throw invalidToken(errorText(error))
        throw new OAuthError(
          'server_error',
          `The key set could not be read: ${errorText(error)}`,
        )
      }
      return authInfoFromClaims(token, claims)
    },
  }
}

// Key-set errors that name the token, not the key set. A timeout, a bad
// key-set body, or a network error is an outage at the provider.
const tokenKeySetCodes = new Set([
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JOSE_NOT_SUPPORTED',
])

function isTokenError(error: unknown) {
  if (!(error instanceof errors.JOSEError)) return false
  const code = error.code
  return (
    code.startsWith('ERR_JWT_') ||
    code.startsWith('ERR_JWS_') ||
    tokenKeySetCodes.has(code)
  )
}

/**
 * Builds an `OAuthTokenVerifier` for an opaque access token.
 *
 * The verifier posts the token to the RFC 7662 introspection endpoint.
 * A token that is not `active` gets a 401 from `createMCPServer`.
 * When the endpoint fails, the caller gets a 500 `server_error`.
 *
 * `clientId`, `scopes`, `expiresAt`, and `extra` come from the
 * introspection response, the same as {@link jwtVerifier}.
 *
 * @param options - The introspection URL and the client credentials
 *
 * @example
 * ```ts
 * const verifier = introspectionVerifier({
 *   introspectionUrl: 'https://auth.example.com/oauth/introspect',
 *   clientId: process.env.OAUTH_CLIENT_ID ?? '',
 *   clientSecret: process.env.OAUTH_CLIENT_SECRET ?? '',
 * })
 * ```
 */
export function introspectionVerifier(
  options: IntrospectionVerifierOptions,
): OAuthTokenVerifier {
  const fetchImpl = options.fetch ?? fetch
  const credentials = btoa(`${options.clientId}:${options.clientSecret}`)
  return {
    async verifyAccessToken(token) {
      const response = await fetchImpl(options.introspectionUrl, {
        method: 'POST',
        headers: {
          authorization: `Basic ${credentials}`,
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({ token }).toString(),
      })
      if (!response.ok) {
        throw new OAuthError(
          'server_error',
          `The introspection endpoint answered ${response.status}.`,
        )
      }
      const claims: unknown = await response.json()
      if (!isRecord(claims) || claims.active !== true) {
        throw invalidToken('The token is not active.')
      }
      return authInfoFromClaims(token, claims)
    },
  }
}

/**
 * Turns the claims of a verified token into the SDK `AuthInfo`.
 * The bearer-auth gate rejects an `AuthInfo` without `expiresAt`,
 * so a token without `exp` is invalid.
 */
function authInfoFromClaims(
  token: string,
  claims: Record<string, unknown>,
): AuthInfo {
  const clientId = firstString(claims.client_id, claims.azp, claims.sub)
  if (clientId === undefined) {
    throw invalidToken('The token has no client_id, azp, or sub claim.')
  }
  const expiresAt = claims.exp
  if (typeof expiresAt !== 'number') {
    throw invalidToken('The token has no exp claim.')
  }
  const resource = resourceUrl(claims.aud)
  return {
    token,
    clientId,
    scopes: scopesOf(claims.scope),
    expiresAt,
    ...(resource === undefined ? {} : { resource }),
    extra: claims,
  }
}

function scopesOf(scope: unknown) {
  if (typeof scope === 'string') return scope.split(' ').filter(Boolean)
  if (!Array.isArray(scope)) return []
  return scope.filter((item): item is string => typeof item === 'string')
}

// `aud` can be a string or a list, and an audience is not always a URL.
function resourceUrl(aud: unknown) {
  const first =
    typeof aud === 'string' ? aud : Array.isArray(aud) ? aud[0] : undefined
  if (typeof first !== 'string') return undefined
  try {
    return new URL(first)
  } catch {
    return undefined
  }
}

function firstString(...values: Array<unknown>) {
  return values.find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
}

function invalidToken(message: string) {
  return new OAuthError(OAuthErrorCode.InvalidToken, message)
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'The token is invalid.'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
