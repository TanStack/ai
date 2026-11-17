import { Cartesia } from '@cartesia/cartesia-js'
import { base64ToArrayBuffer } from '@tanstack/ai-utils'
import type { ClientOptions } from '@cartesia/cartesia-js'

/** The Cartesia SDK client options that the adapters accept. */
export type CartesiaConfig = Pick<
  ClientOptions,
  'apiKey' | 'baseURL' | 'defaultHeaders' | 'fetch'
>

/** Read the Cartesia API key from the server environment. */
export function getCartesiaApiKeyFromEnv(): string {
  const key =
    typeof process === 'undefined' ? undefined : process.env.CARTESIA_API_KEY
  if (!key) throw new Error('CARTESIA_API_KEY is required')
  return key
}

/** Create the Cartesia SDK client for an adapter. */
export function createCartesiaClient(config: CartesiaConfig = {}): Cartesia {
  return new Cartesia({
    ...config,
    apiKey: config.apiKey ?? getCartesiaApiKeyFromEnv(),
  })
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
  if (!match && audio.startsWith('data:')) {
    throw new Error('Cartesia transcription needs a base64 data URL')
  }
  const mimeType = match?.[1] ?? 'audio/mpeg'
  const data = match?.[2] ?? audio
  return new File([base64ToArrayBuffer(data)], 'audio', { type: mimeType })
}
