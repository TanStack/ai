import { OAuthError } from '@modelcontextprotocol/server'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import type { CryptoKey } from 'jose'
import { describe, expect, it } from 'vitest'
import { introspectionVerifier, jwtVerifier } from '../../src/server/auth'

const issuer = 'https://auth.example.com/'
const audience = 'https://mcp.example.com/mcp'
const jwksUrl = 'https://auth.example.com/.well-known/jwks.json'

async function signingKeys() {
  const pair = await generateKeyPair('RS256')
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'key-1',
    alg: 'RS256',
  }
  // Serve the key set from memory instead of the network.
  const fetchJwks = async () => Response.json({ keys: [jwk] })
  return { privateKey: pair.privateKey, fetchJwks }
}

function signToken(
  privateKey: CryptoKey,
  claims: {
    issuer?: string
    audience?: string
    expiresIn?: string
    extra?: Record<string, unknown>
  } = {},
) {
  return new SignJWT({ scope: 'mcp read', ...claims.extra })
    .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
    .setIssuer(claims.issuer ?? issuer)
    .setAudience(claims.audience ?? audience)
    .setSubject('user-1')
    .setIssuedAt()
    .setExpirationTime(claims.expiresIn ?? '5m')
    .sign(privateKey)
}

async function oauthErrorOf(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    if (!(error instanceof OAuthError)) {
      throw new Error(`expected an OAuthError, got ${String(error)}`)
    }
    return error
  }
  throw new Error('expected a rejection')
}

describe('jwtVerifier', () => {
  it('returns the SDK AuthInfo for a valid token', async () => {
    const keys = await signingKeys()
    const verifier = jwtVerifier({
      jwksUrl,
      issuer,
      audience,
      fetch: keys.fetchJwks,
    })
    const token = await signToken(keys.privateKey, {
      extra: { client_id: 'app-1' },
    })

    const info = await verifier.verifyAccessToken(token)

    expect(info.token).toBe(token)
    expect(info.clientId).toBe('app-1')
    expect(info.scopes).toEqual(['mcp', 'read'])
    expect(info.expiresAt).toEqual(expect.any(Number))
    expect(info.resource?.href).toBe(audience)
    expect(info.extra).toMatchObject({ sub: 'user-1', iss: issuer })
  })

  it('uses sub as the client id when the token has no client_id', async () => {
    const keys = await signingKeys()
    const verifier = jwtVerifier({
      jwksUrl,
      issuer,
      audience,
      fetch: keys.fetchJwks,
    })

    const info = await verifier.verifyAccessToken(
      await signToken(keys.privateKey),
    )

    expect(info.clientId).toBe('user-1')
  })

  it('rejects a token for another issuer, audience, or time', async () => {
    const keys = await signingKeys()
    const verifier = jwtVerifier({
      jwksUrl,
      issuer,
      audience,
      fetch: keys.fetchJwks,
    })
    const cases = [
      { issuer: 'https://other.example.com/' },
      { audience: 'https://other.example.com/mcp' },
      { expiresIn: '-1m' },
    ]

    for (const claims of cases) {
      const token = await signToken(keys.privateKey, claims)
      const error = await oauthErrorOf(() => verifier.verifyAccessToken(token))
      expect(error.code).toBe('invalid_token')
    }
  })

  it('rejects a token signed by a key that is not in the key set', async () => {
    const keys = await signingKeys()
    const other = await signingKeys()
    const verifier = jwtVerifier({
      jwksUrl,
      issuer,
      audience,
      fetch: keys.fetchJwks,
    })

    const token = await signToken(other.privateKey)
    const error = await oauthErrorOf(() => verifier.verifyAccessToken(token))

    expect(error.code).toBe('invalid_token')
  })

  it('rejects a value that is not a JWT', async () => {
    const keys = await signingKeys()
    const verifier = jwtVerifier({
      jwksUrl,
      issuer,
      audience,
      fetch: keys.fetchJwks,
    })

    const error = await oauthErrorOf(() =>
      verifier.verifyAccessToken('not-a-jwt'),
    )

    expect(error.code).toBe('invalid_token')
  })

  it('reports a key set outage as a server error, not a bad token', async () => {
    const keys = await signingKeys()
    const token = await signToken(keys.privateKey)
    const outages = [
      async () => {
        throw new TypeError('fetch failed')
      },
      async () => new Response('down', { status: 503 }),
    ]

    for (const fetchJwks of outages) {
      const verifier = jwtVerifier({
        jwksUrl,
        issuer,
        audience,
        fetch: fetchJwks,
      })
      const error = await oauthErrorOf(() => verifier.verifyAccessToken(token))
      expect(error.code).toBe('server_error')
    }
  })
})

describe('introspectionVerifier', () => {
  function endpoint(reply: () => Response) {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return reply()
    }
    return { calls, fetchImpl }
  }

  const options = {
    introspectionUrl: 'https://auth.example.com/oauth/introspect',
    clientId: 'mcp-server',
    clientSecret: 'secret',
  }

  it('posts the token with basic auth and returns AuthInfo for an active token', async () => {
    const server = endpoint(() =>
      Response.json({
        active: true,
        client_id: 'app-1',
        scope: 'mcp',
        sub: 'user-1',
        exp: 1_900_000_000,
      }),
    )
    const verifier = introspectionVerifier({
      ...options,
      fetch: server.fetchImpl,
    })

    const info = await verifier.verifyAccessToken('opaque-1')

    expect(server.calls[0]?.url).toBe(options.introspectionUrl)
    expect(server.calls[0]?.init?.method).toBe('POST')
    expect(server.calls[0]?.init?.body).toBe('token=opaque-1')
    expect(
      new Headers(server.calls[0]?.init?.headers).get('authorization'),
    ).toBe(`Basic ${btoa('mcp-server:secret')}`)
    expect(info).toMatchObject({
      token: 'opaque-1',
      clientId: 'app-1',
      scopes: ['mcp'],
      expiresAt: 1_900_000_000,
      extra: { sub: 'user-1' },
    })
  })

  it('rejects a token that is not active', async () => {
    const server = endpoint(() => Response.json({ active: false }))
    const verifier = introspectionVerifier({
      ...options,
      fetch: server.fetchImpl,
    })

    const error = await oauthErrorOf(() =>
      verifier.verifyAccessToken('opaque-1'),
    )

    expect(error.code).toBe('invalid_token')
  })

  it('reports a failed endpoint as a server error, not a bad token', async () => {
    const server = endpoint(() => new Response(null, { status: 503 }))
    const verifier = introspectionVerifier({
      ...options,
      fetch: server.fetchImpl,
    })

    const error = await oauthErrorOf(() =>
      verifier.verifyAccessToken('opaque-1'),
    )

    expect(error.code).toBe('server_error')
  })
})
