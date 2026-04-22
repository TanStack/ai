import { fal } from '@fal-ai/client'

export interface FalClientConfig {
  apiKey: string
  proxyUrl?: string
}

interface EnvObject {
  FAL_KEY?: string
}

interface WindowWithEnv {
  env?: EnvObject
}

function getEnvironment(): EnvObject | undefined {
  if (typeof globalThis !== 'undefined') {
    const win = (globalThis as { window?: WindowWithEnv }).window
    if (win?.env) {
      return win.env
    }
  }
  if (typeof process !== 'undefined') {
    return process.env as EnvObject
  }
  return undefined
}

export function getFalApiKeyFromEnv(): string {
  const env = getEnvironment()
  const key = env?.FAL_KEY

  if (!key) {
    throw new Error(
      'FAL_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }

  return key
}

export function configureFalClient(config?: FalClientConfig): void {
  const apiKey = config?.apiKey ?? getFalApiKeyFromEnv()
  fal.config({
    credentials: apiKey,
    ...(config?.proxyUrl ? { proxyUrl: config.proxyUrl } : {}),
  })
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2)}`
}

/**
 * Extract a safe file extension from a URL. Strips query strings and only
 * returns the extension when it looks like a real one (2-5 alphanumeric
 * chars). Returns undefined otherwise so callers can fall back to a default.
 */
export function extractUrlExtension(url: string): string | undefined {
  const withoutQuery = url.split('?')[0]
  const extension = withoutQuery?.split('.').pop()
  if (!extension || extension === withoutQuery) return undefined
  return /^[a-z0-9]{2,5}$/i.test(extension) ? extension : undefined
}

/**
 * Derive a reasonable audio content-type. Prefers the explicit MIME (stripped
 * of parameters), then an extension-based lookup for common audio formats,
 * otherwise falls back to audio/mpeg — fal URLs virtually always serve mp3.
 */
export function deriveAudioContentType(
  explicitContentType: string | undefined,
  url: string,
): string {
  const stripped = explicitContentType?.split(';')[0]?.trim()
  if (stripped) return stripped

  const ext = extractUrlExtension(url)?.toLowerCase()
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'ogg':
    case 'oga':
      return 'audio/ogg'
    case 'flac':
      return 'audio/flac'
    case 'm4a':
    case 'mp4':
    case 'aac':
      return 'audio/mp4'
    case 'webm':
      return 'audio/webm'
    default:
      return 'audio/mpeg'
  }
}

/**
 * Convert an ArrayBuffer to base64 in a cross-runtime way.
 *
 * The naive `btoa(String.fromCharCode(...bytes))` form blows up V8's argument
 * limit (~65k) on realistic audio payloads, so we either use `Buffer` (Node /
 * Bun) or walk the byte array in a single loop (browser).
 */
export function arrayBufferToBase64(bytes: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(bytes).toString('base64')
  }
  const view = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < view.byteLength; i += 1) {
    binary += String.fromCharCode(view[i]!)
  }
  return btoa(binary)
}
