import type { AwsCredentialIdentity } from '@smithy/types'

// SigV4 header signing with WebCrypto. This is a port of the part of
// `@smithy/signature-v4` `sign()` that the Bedrock fetch wrapper uses: default
// options (path escape on, `x-amz-content-sha256` on), headers only.
// ponytail: no signing-key cache. Add one if the 5 HMAC steps per request show up in a profile.

const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

// SigV4 never signs these headers. Same list as `@smithy/signature-v4`.
const UNSIGNABLE_HEADERS = new Set([
  'authorization',
  'cache-control',
  'connection',
  'expect',
  'from',
  'keep-alive',
  'max-forwards',
  'pragma',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
  'x-amzn-trace-id',
])

const encoder = new TextEncoder()

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function sha256Hex(data: BufferSource) {
  return toHex(await crypto.subtle.digest('SHA-256', data))
}

async function hmac(key: BufferSource, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
}

// encodeURIComponent also encodes ! ' ( ) * for RFC 3986.
function escapeUri(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

// Remove empty, "." and ".." segments, then encode the path a second time.
// The wire path is already encoded once, and AWS (not S3) wants it twice.
function canonicalPath(pathname: string) {
  const segments: Array<string> = []
  for (const segment of pathname.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  const trailingSlash = segments.length > 0 && pathname.endsWith('/') ? '/' : ''
  return escapeUri(`/${segments.join('/')}${trailingSlash}`).replace(
    /%2F/g,
    '/',
  )
}

// Decode each pair, encode it with the SigV4 rules, sort by key, then by value.
function canonicalQuery(search: string) {
  const pairs = search
    .slice(1)
    .split('&')
    .filter((pair) => pair !== '')
    .map((pair) => {
      const equals = pair.indexOf('=')
      const key = equals === -1 ? pair : pair.slice(0, equals)
      const value = equals === -1 ? '' : pair.slice(equals + 1)
      return [
        escapeUri(decodeURIComponent(key)),
        escapeUri(decodeURIComponent(value)),
      ]
    })
  pairs.sort(([keyA = '', valueA = ''], [keyB = '', valueB = '']) => {
    if (keyA !== keyB) return keyA < keyB ? -1 : 1
    if (valueA === valueB) return 0
    return valueA < valueB ? -1 : 1
  })
  return pairs.map(([key, value]) => `${key}=${value}`).join('&')
}

// A stream, Blob, or FormData body cannot be hashed before it is sent.
async function payloadHash(body: BodyInit | null | undefined) {
  if (body === null || body === undefined) return EMPTY_SHA256
  if (typeof body === 'string') return sha256Hex(encoder.encode(body))
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return sha256Hex(body)
  }
  return 'UNSIGNED-PAYLOAD'
}

/**
 * Signs an HTTP request with AWS Signature Version 4 (header auth).
 *
 * @param request - The request to sign. `host` always comes from `url`.
 * @param credentials - Resolved AWS credentials. `sessionToken` adds `x-amz-security-token`.
 * @param options - SigV4 `service` and `region`. `date` defaults to now.
 * @returns The request headers plus `host`, `x-amz-date`,
 *   `x-amz-content-sha256`, `x-amz-security-token` (with a session token),
 *   and `authorization`.
 *
 * @example
 * const headers = await signSigV4(
 *   { method: 'POST', url, headers: { 'content-type': 'application/json' }, body },
 *   await credentials(),
 *   { service: 'bedrock', region: 'us-east-1' },
 * )
 */
export async function signSigV4(
  request: {
    method: string
    url: URL | string
    headers?: HeadersInit
    body?: BodyInit | null
  },
  credentials: AwsCredentialIdentity,
  options: { service: string; region: string; date?: Date },
) {
  const url = new URL(request.url)
  const headers = new Headers(request.headers)
  headers.delete('authorization')
  headers.delete('date')
  headers.set('host', url.host)

  const longDate = (options.date ?? new Date())
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '')
  const shortDate = longDate.slice(0, 8)
  const scope = `${shortDate}/${options.region}/${options.service}/aws4_request`
  headers.set('x-amz-date', longDate)
  if (credentials.sessionToken) {
    headers.set('x-amz-security-token', credentials.sessionToken)
  }
  const bodyHash =
    headers.get('x-amz-content-sha256') ?? (await payloadHash(request.body))
  headers.set('x-amz-content-sha256', bodyHash)

  // Headers iterate with lowercase names in sorted order, as SigV4 needs.
  const signed: Array<[string, string]> = []
  for (const [name, value] of headers) {
    const isUnsignable =
      UNSIGNABLE_HEADERS.has(name) || /^(proxy|sec)-/.test(name)
    if (isUnsignable) continue
    signed.push([name, value.trim().replace(/\s+/g, ' ')])
  }
  const signedHeaders = signed.map(([name]) => name).join(';')
  const canonicalRequest = [
    request.method,
    canonicalPath(url.pathname),
    canonicalQuery(url.search),
    ...signed.map(([name, value]) => `${name}:${value}`),
    '',
    signedHeaders,
    bodyHash,
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    longDate,
    scope,
    await sha256Hex(encoder.encode(canonicalRequest)),
  ].join('\n')
  let signingKey: BufferSource = encoder.encode(
    `AWS4${credentials.secretAccessKey}`,
  )
  const scopeParts = [
    shortDate,
    options.region,
    options.service,
    'aws4_request',
  ]
  for (const part of scopeParts) {
    signingKey = await hmac(signingKey, part)
  }
  const signature = toHex(await hmac(signingKey, stringToSign))

  headers.set(
    'authorization',
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  )
  return headers
}
