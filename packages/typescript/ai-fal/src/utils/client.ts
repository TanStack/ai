import { fal } from '@fal-ai/client'
import { generateId as _generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'

export interface FalClientConfig {
  apiKey: string
  proxyUrl?: string
}

export function getFalApiKeyFromEnv(): string {
  return getApiKeyFromEnv('FAL_KEY')
}

export function configureFalClient(config?: FalClientConfig): void {
  const apiKey = config?.apiKey ?? getFalApiKeyFromEnv()
  fal.config({
    credentials: apiKey,
    ...(config?.proxyUrl ? { proxyUrl: config.proxyUrl } : {}),
  })
}

export function generateId(prefix: string): string {
  return _generateId(prefix)
}

/**
 * Extract a safe file extension from a URL. Strips query strings, URL
 * fragments, and any trailing slashes, and only returns the extension when
 * it looks like a real one (2-5 alphanumeric chars). Returns undefined
 * otherwise so callers can fall back to a default.
 */
export function extractUrlExtension(url: string): string | undefined {
  // Parse via URL when possible so we only look at the pathname and never
  // mistake a TLD (e.g. the `.com` in `https://x.com/`) for a file extension.
  let pathname: string
  try {
    const parsed = new URL(url)
    pathname = parsed.pathname
  } catch {
    // Fall back to treating the input as a raw path when URL parsing fails
    // (e.g. the caller passed a bare path). Still strip ?query and #fragment.
    pathname = url.split('?')[0]!.split('#')[0]!
  }
  // Drop trailing slashes so `/path/audio.mp3/` still yields `mp3`.
  const normalized = pathname.replace(/\/+$/, '')
  // Require at least one `/` — otherwise we're looking at an empty pathname
  // (bare-host URLs like `https://x.com/` land here after stripping the
  // trailing slash).
  if (!normalized.includes('/')) return undefined
  const lastSegment = normalized.split('/').pop()
  if (!lastSegment) return undefined
  const extension = lastSegment.split('.').pop()
  if (!extension || extension === lastSegment) return undefined
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
    case 'aac':
      return 'audio/aac'
    case 'm4a':
    case 'mp4':
      return 'audio/mp4'
    case 'webm':
      return 'audio/webm'
    default:
      return 'audio/mpeg'
  }
}

/**
 * Decode a `data:` URL into a Blob so fal-client can auto-upload it via
 * `fal.storage.upload`. fal's inference API rejects data URLs with a 422
 * "Unsupported data URL", so we convert them before handing them off.
 *
 * Supports both base64 and URL-encoded data URLs. Returns `undefined` for
 * anything that isn't a data URL, so callers can fall through to other
 * handling (http URLs are passed to fal as-is).
 */
export function dataUrlToBlob(value: string): Blob | undefined {
  if (!value.startsWith('data:')) return undefined
  const commaIndex = value.indexOf(',')
  if (commaIndex === -1) return undefined

  const header = value.slice(5, commaIndex)
  const payload = value.slice(commaIndex + 1)
  const isBase64 = /;base64$/i.test(header)
  const mimeType = header.split(';')[0] || 'application/octet-stream'

  if (isBase64) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new Blob([bytes], { type: mimeType })
  }

  return new Blob([decodeURIComponent(payload)], { type: mimeType })
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
