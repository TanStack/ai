import { base64ToArrayBuffer } from '@tanstack/ai-utils'

export interface CartesiaConfig {
  apiKey?: string
  baseURL?: string
  defaultHeaders?: Record<string, string>
}

export function getCartesiaApiKeyFromEnv(): string {
  const key = process.env.CARTESIA_API_KEY
  if (!key) throw new Error('CARTESIA_API_KEY is required')
  return key
}

export class CartesiaClient {
  private readonly apiKey: string
  private readonly baseURL: string
  private readonly headers: Record<string, string>

  constructor(config: CartesiaConfig = {}) {
    this.apiKey = config.apiKey ?? getCartesiaApiKeyFromEnv()
    this.baseURL = (config.baseURL ?? 'https://api.cartesia.ai').replace(
      /\/$/,
      '',
    )
    this.headers = config.defaultHeaders ?? {}
  }

  async post(
    path: string,
    body: BodyInit,
    signal?: AbortSignal,
  ): Promise<Response> {
    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: {
        ...this.headers,
        Authorization: `Bearer ${this.apiKey}`,
        'Cartesia-Version': '2026-08-14',
        ...(typeof body === 'string'
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
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

export function toAudioFile(audio: string | File | Blob | ArrayBuffer): File {
  if (audio instanceof File) return audio
  if (audio instanceof Blob) {
    return new File([audio], 'audio', { type: audio.type || 'audio/mpeg' })
  }
  if (audio instanceof ArrayBuffer) {
    return new File([audio], 'audio.mp3', { type: 'audio/mpeg' })
  }
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(audio)
  const mimeType = match?.[1] ?? 'audio/mpeg'
  const data = match?.[2] ?? audio
  return new File([base64ToArrayBuffer(data)], 'audio', { type: mimeType })
}
