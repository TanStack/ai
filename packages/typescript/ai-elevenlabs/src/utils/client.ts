import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import type { ElevenLabsOutputFormat } from '../model-meta'

/**
 * Configuration for any ElevenLabs adapter. When `apiKey` is omitted we read
 * `ELEVENLABS_API_KEY` from `process.env` / `window.env` to match the
 * pattern the realtime adapters already use.
 */
export interface ElevenLabsClientConfig {
  apiKey?: string
  /** Override the API base URL — handy for tests + self-hosted proxies. */
  baseUrl?: string
  /** Per-request timeout passed through to the SDK (ms). */
  timeoutInSeconds?: number
  /** Override the number of SDK-level retries. */
  maxRetries?: number
  /** Extra headers attached to every request (e.g. test multiplexing). */
  headers?: Record<string, string>
}

interface EnvObject {
  ELEVENLABS_API_KEY?: string
  ELEVENLABS_AGENT_ID?: string
}

interface WindowWithEnv {
  env?: EnvObject
}

function getEnvironment(): EnvObject | undefined {
  if (typeof globalThis !== 'undefined') {
    const win = (globalThis as { window?: WindowWithEnv }).window
    if (win?.env) return win.env
  }
  if (typeof process !== 'undefined') {
    return process.env as EnvObject
  }
  return undefined
}

export function getElevenLabsApiKeyFromEnv(): string {
  const key = getEnvironment()?.ELEVENLABS_API_KEY
  if (!key) {
    throw new Error(
      'ELEVENLABS_API_KEY is required. Please set it in your environment ' +
        'variables or pass it explicitly to the adapter factory.',
    )
  }
  return key
}

export function getElevenLabsAgentIdFromEnv(): string {
  const id = getEnvironment()?.ELEVENLABS_AGENT_ID
  if (!id) {
    throw new Error(
      'ELEVENLABS_AGENT_ID is required. Please set it in your environment ' +
        'variables or pass `agentId` explicitly to elevenlabsRealtimeToken().',
    )
  }
  return id
}

/**
 * Build an `ElevenLabsClient` with env-based or explicit credentials.
 * Each adapter calls this once at construction time so unit tests can
 * pass in an explicit key without needing `process.env`.
 */
export function createElevenLabsClient(
  config?: ElevenLabsClientConfig,
): ElevenLabsClient {
  const apiKey = config?.apiKey ?? getElevenLabsApiKeyFromEnv()
  return new ElevenLabsClient({
    apiKey,
    ...(config?.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config?.timeoutInSeconds != null
      ? { timeoutInSeconds: config.timeoutInSeconds }
      : {}),
    ...(config?.maxRetries != null ? { maxRetries: config.maxRetries } : {}),
    ...(config?.headers ? { headers: config.headers } : {}),
  })
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2)}`
}

/**
 * Convert an ArrayBuffer to base64 in a cross-runtime way.
 *
 * The naive `btoa(String.fromCharCode(...bytes))` form blows up V8's argument
 * limit (~65k) on realistic audio payloads, so we either use `Buffer`
 * (Node / Bun) or walk the byte array in a single loop (browser).
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(buffer).toString('base64')
  }
  const view = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < view.byteLength; i += 1) {
    binary += String.fromCharCode(view[i]!)
  }
  return btoa(binary)
}

/**
 * Drain a `ReadableStream<Uint8Array>` (what the ElevenLabs SDK returns for
 * audio endpoints) into a single `Uint8Array`, then expose it as an
 * `ArrayBuffer` slice. We concatenate ourselves rather than going through
 * `new Response(stream).arrayBuffer()` so we stay runtime-agnostic.
 */
export async function readStreamToArrayBuffer(
  stream: ReadableStream<Uint8Array>,
): Promise<ArrayBuffer> {
  const reader = stream.getReader()
  const chunks: Array<Uint8Array> = []
  let total = 0
  try {
    let result = await reader.read()
    while (!result.done) {
      chunks.push(result.value)
      total += result.value.byteLength
      result = await reader.read()
    }
  } finally {
    reader.releaseLock()
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged.buffer.slice(
    merged.byteOffset,
    merged.byteOffset + merged.byteLength,
  )
}

/**
 * Decode a `data:` URL into a Blob for upload to the ElevenLabs STT API
 * (which only accepts multipart files or https URLs). Supports base64 and
 * URL-encoded payloads. Returns `undefined` for non-data-URL strings so the
 * caller can fall through to treating the input as an https URL.
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
 * Break an ElevenLabs `output_format` string (`mp3_44100_128`,
 * `pcm_24000`, `opus_48000_64`, `ulaw_8000`, ...) into a file extension and
 * content-type suitable for `TTSResult` / `AudioGenerationResult` consumers.
 *
 * Unknown codecs fall back to `mp3` / `audio/mpeg` because the ElevenLabs
 * default is `mp3_44100_128` — mispredicting on an exotic format is safer
 * than throwing in the adapter.
 */
export function parseOutputFormat(fmt: ElevenLabsOutputFormat | undefined): {
  format: string
  contentType: string
} {
  const codec = (fmt || 'mp3_44100_128').split('_')[0]?.toLowerCase()
  switch (codec) {
    case 'mp3':
      return { format: 'mp3', contentType: 'audio/mpeg' }
    case 'pcm':
      return { format: 'pcm', contentType: 'audio/pcm' }
    case 'opus':
      return { format: 'opus', contentType: 'audio/opus' }
    case 'ulaw':
      return { format: 'ulaw', contentType: 'audio/basic' }
    case 'alaw':
      return { format: 'alaw', contentType: 'audio/x-alaw-basic' }
    default:
      return { format: 'mp3', contentType: 'audio/mpeg' }
  }
}
