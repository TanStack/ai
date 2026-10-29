import { decodeMCPEventSecret } from './secret'

function concat(prefix: Uint8Array, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(prefix.byteLength + body.byteLength)
  out.set(prefix)
  out.set(body, prefix.byteLength)
  return out
}

function signedBytes(
  messageId: string,
  timestamp: number,
  body: Uint8Array,
): Uint8Array {
  const prefix = new TextEncoder().encode(`${messageId}.${timestamp}.`)
  return concat(prefix, body)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array | undefined {
  try {
    const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return undefined
  }
}

async function hmacKey(secret: string, usages: Array<'sign' | 'verify'>) {
  return crypto.subtle.importKey(
    'raw',
    decodeMCPEventSecret(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  )
}

/**
 * Sign a webhook body as Standard Webhooks v1 (`v1,<base64>`).
 *
 * @experimental
 */
export async function signMCPEventPayload(input: {
  secret: string
  messageId: string
  timestamp: number
  body: Uint8Array
}): Promise<string> {
  const key = await hmacKey(input.secret, ['sign'])
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    signedBytes(input.messageId, input.timestamp, input.body) as BufferSource,
  )
  return `v1,${bytesToBase64(new Uint8Array(signature))}`
}

/**
 * Verify a Standard Webhooks `webhook-signature` header.
 * Accepts any valid `v1,` entry. Ignores `v1a,` and unknown versions.
 *
 * @experimental
 */
export async function verifyMCPEventSignature(input: {
  secret: string
  messageId: string
  timestamp: number
  body: Uint8Array
  header: string
}): Promise<boolean> {
  const key = await hmacKey(input.secret, ['verify'])
  const payload = signedBytes(input.messageId, input.timestamp, input.body)
  const entries = input.header.trim().split(/\s+/)
  for (const entry of entries) {
    const comma = entry.indexOf(',')
    if (comma <= 0) continue
    const version = entry.slice(0, comma)
    if (version !== 'v1') continue
    const signature = base64ToBytes(entry.slice(comma + 1))
    if (signature === undefined || signature.byteLength === 0) continue
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      signature as BufferSource,
      payload as BufferSource,
    )
    if (ok) return true
  }
  return false
}
