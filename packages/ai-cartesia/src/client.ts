import { base64ToArrayBuffer } from '@tanstack/ai-utils'

export interface CartesiaConfig {
  apiKey?: string
  baseURL?: string
  defaultHeaders?: Record<string, string>
}

/** Read the Cartesia API key from the server environment. */
export function getCartesiaApiKeyFromEnv(): string {
  const key =
    typeof process === 'undefined' ? undefined : process.env.CARTESIA_API_KEY
  if (!key) throw new Error('CARTESIA_API_KEY is required')
  return key
}

/** Send authenticated requests to the Cartesia API. */
export class CartesiaClient {
  private readonly apiKey: string
  private readonly baseURL: string
  private readonly headers: Record<string, string>

  /** Configure the API key, endpoint, and additional request headers. */
  constructor(config: CartesiaConfig = {}) {
    this.apiKey = config.apiKey ?? getCartesiaApiKeyFromEnv()
    this.baseURL = (config.baseURL ?? 'https://api.cartesia.ai').replace(
      /\/$/,
      '',
    )
    this.headers = config.defaultHeaders ?? {}
  }

  /** Send a JSON or multipart POST request to Cartesia. */
  async post(
    path: string,
    body: BodyInit,
    signal?: AbortSignal,
  ): Promise<Response> {
    const headers = new Headers(this.headers)
    headers.set('Authorization', `Bearer ${this.apiKey}`)
    headers.set('Cartesia-Version', '2026-08-14')
    if (typeof body === 'string')
      headers.set('Content-Type', 'application/json')
    else headers.delete('Content-Type')
    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers,
      body,
      signal,
    })
    if (!response.ok) {
      const message = await response.text()
      throw new Error(`Cartesia API error ${response.status}: ${message}`)
    }
    return response
  }
}

/** Convert an audio input to a file for multipart transcription. */
export function toAudioFile(audio: string | File | Blob | ArrayBuffer): File {
  if (audio instanceof File) return audio
  if (audio instanceof Blob) {
    return new File([audio], 'audio', { type: audio.type || 'audio/mpeg' })
  }
  if (audio instanceof ArrayBuffer) {
    return new File([audio], 'audio.mp3', { type: 'audio/mpeg' })
  }
  const match = /^data:([^;,]+)(?:;[^;,]+)*;base64,(.*)$/is.exec(audio)
  const mimeType = match?.[1] ?? 'audio/mpeg'
  const data = match?.[2] ?? audio
  return new File([base64ToArrayBuffer(data)], 'audio', { type: mimeType })
}
