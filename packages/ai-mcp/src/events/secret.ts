import { MCPEventConfigError } from '../errors'

const PREFIX = 'whsec_'
const MIN_BYTES = 24
const MAX_BYTES = 64
const GENERATED_BYTES = 32

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    throw new MCPEventConfigError('MCP event secret is not valid base64')
  }
}

/**
 * Generate a Standard Webhooks secret: `whsec_` plus 32 random bytes.
 *
 * @experimental
 *
 * @example
 * ```ts
 * import { createMCPEventSecret } from '@tanstack/ai-mcp/events'
 *
 * const secret = createMCPEventSecret()
 * ```
 */
export function createMCPEventSecret(): string {
  const bytes = new Uint8Array(GENERATED_BYTES)
  crypto.getRandomValues(bytes)
  return `${PREFIX}${bytesToBase64(bytes)}`
}

/**
 * Decode a `whsec_` secret to the raw HMAC key.
 *
 * @experimental
 */
export function decodeMCPEventSecret(secret: string): Uint8Array {
  if (!secret.startsWith(PREFIX)) {
    throw new MCPEventConfigError('MCP event secret must start with whsec_')
  }
  const encoded = secret.slice(PREFIX.length)
  if (encoded.length === 0) {
    throw new MCPEventConfigError('MCP event secret is not valid base64')
  }
  const bytes = base64ToBytes(encoded)
  if (bytes.byteLength < MIN_BYTES || bytes.byteLength > MAX_BYTES) {
    throw new MCPEventConfigError(
      'MCP event secret must decode to 24 to 64 bytes',
    )
  }
  return bytes
}
