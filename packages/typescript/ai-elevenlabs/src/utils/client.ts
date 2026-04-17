/**
 * Shared configuration and request helpers for the ElevenLabs adapters.
 */

export interface ElevenLabsClientConfig {
  /** Your ElevenLabs API key (xi-api-key header) */
  apiKey: string
  /**
   * Override the base URL. Defaults to `https://api.elevenlabs.io`.
   * Useful for region endpoints or a proxy.
   */
  baseUrl?: string
  /** Additional headers to send on every request */
  headers?: Record<string, string>
}

const DEFAULT_BASE_URL = 'https://api.elevenlabs.io'

function resolveEnv(): Record<string, string | undefined> | undefined {
  if (typeof globalThis !== 'undefined') {
    const win = (globalThis as { window?: { env?: Record<string, string> } })
      .window
    if (win?.env) {
      return win.env
    }
  }
  if (typeof process !== 'undefined') {
    return process.env
  }
  return undefined
}

/**
 * Read the ElevenLabs API key from the environment.
 *
 * Looks for `ELEVENLABS_API_KEY` or `ELEVEN_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (browser with injected env)
 *
 * @throws when no key is present.
 */
export function getElevenLabsApiKeyFromEnv(): string {
  const env = resolveEnv()
  const key = env?.ELEVENLABS_API_KEY || env?.ELEVEN_API_KEY

  if (!key) {
    throw new Error(
      'ELEVENLABS_API_KEY is required. Set it in your environment or pass it explicitly to the adapter factory.',
    )
  }
  return key
}

export function resolveBaseUrl(config: ElevenLabsClientConfig): string {
  return (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
}

export function buildHeaders(
  config: ElevenLabsClientConfig,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    'xi-api-key': config.apiKey,
    ...config.headers,
    ...extra,
  }
}

/**
 * Perform a POST request expecting a binary audio response.
 * Throws an Error with the server's message on non-2xx.
 */
export async function postForAudio(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })

  if (!response.ok) {
    throw new Error(await readError(response, 'ElevenLabs request failed'))
  }

  const contentType = response.headers.get('content-type') ?? 'audio/mpeg'
  const bytes = await response.arrayBuffer()
  return { bytes, contentType }
}

/**
 * Perform a POST request expecting a JSON response.
 * Throws an Error with the server's message on non-2xx.
 */
export async function postForJson<T>(
  url: string,
  headers: Record<string, string>,
  init: { body?: BodyInit; contentType?: string } = {},
): Promise<T> {
  const finalHeaders: Record<string, string> = { ...headers }
  if (init.contentType) {
    finalHeaders['Content-Type'] = init.contentType
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: finalHeaders,
    body: init.body,
  })

  if (!response.ok) {
    throw new Error(await readError(response, 'ElevenLabs request failed'))
  }

  return (await response.json()) as T
}

async function readError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = await response.text()
    if (body) {
      return `${fallback}: ${response.status} ${response.statusText} — ${body}`
    }
  } catch {
    // fall through to fallback message
  }
  return `${fallback}: ${response.status} ${response.statusText}`
}

/**
 * Convert an ArrayBuffer to a base64 string in a cross-runtime way.
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

/**
 * Map an ElevenLabs `output_format` string back to a short format name
 * and a content type.
 *
 * Examples:
 * - "mp3_44100_128" → { format: "mp3", contentType: "audio/mpeg" }
 * - "wav_48000" → { format: "wav", contentType: "audio/wav" }
 * - "opus_48000_192" → { format: "opus", contentType: "audio/opus" }
 */
export function parseOutputFormat(outputFormat: string | undefined): {
  format: string
  contentType: string
} {
  const normalized = (outputFormat ?? 'mp3_44100_128').toLowerCase()
  const codec = normalized.split('_')[0] ?? 'mp3'

  const contentType = CONTENT_TYPE_BY_CODEC[codec] ?? 'audio/mpeg'
  return { format: codec, contentType }
}

const CONTENT_TYPE_BY_CODEC: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pcm: 'audio/pcm',
  opus: 'audio/opus',
  ulaw: 'audio/basic',
  alaw: 'audio/basic',
  flac: 'audio/flac',
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
}
