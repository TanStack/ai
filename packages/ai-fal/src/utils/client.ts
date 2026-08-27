import { fal } from '@fal-ai/client'
import { generateId as _generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'
import { createBillingFetch } from './billing'

export interface FalClientConfig {
  apiKey: string
  proxyUrl?: string
  fetch?: typeof fetch
}

export function getFalApiKeyFromEnv(): string {
  return getApiKeyFromEnv('FAL_KEY')
}

export function configureFalClient(config?: FalClientConfig): void {
  const apiKey = config?.apiKey ?? getFalApiKeyFromEnv()
  fal.config({
    credentials: apiKey,
    fetch: createBillingFetch(config?.fetch),
    ...(config?.proxyUrl ? { proxyUrl: config.proxyUrl } : {}),
  })
}

export function generateId(prefix: string): string {
  return _generateId(prefix)
}

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
    pathname = url.split('?')[0]?.split('#')[0] ?? url
  }
  // Drop trailing slashes so `/path/audio.mp3/` still yields `mp3`.
  const normalized = pathname.replace(/\/+$/, '')
  if (!normalized.includes('/')) return undefined
  const lastSegment = normalized.split('/').pop()
  if (!lastSegment) return undefined
  const extension = lastSegment.split('.').pop()
  if (!extension) return undefined
  if (extension === lastSegment) return undefined
  return /^[a-z0-9]{2,5}$/i.test(extension) ? extension : undefined
}

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
    case undefined:
    default:
      return 'audio/mpeg'
  }
}

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

export function arrayBufferToBase64(bytes: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(bytes).toString('base64')
  }
  const view = new Uint8Array(bytes)
  let binary = ''
  for (const byte of view) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}
