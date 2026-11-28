import { Cartesia } from '@cartesia/cartesia-js'
import { base64ToArrayBuffer } from '@tanstack/ai-utils'
import type { ClientOptions } from '@cartesia/cartesia-js'

/** The Cartesia SDK client options that the adapters accept. */
export type CartesiaConfig = Pick<
  ClientOptions,
  'apiKey' | 'baseURL' | 'defaultHeaders' | 'fetch'
>

/** `CartesiaConfig` plus the options of one adapter. */
export type CartesiaAdapterConfig<TProviderOptions> = CartesiaConfig & {
  /**
   * Default `modelOptions` for every call. The activity merges them under the
   * call's `modelOptions`. A key the call sets replaces the default key in
   * full.
   */
  defaultModelOptions?: TProviderOptions
}

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

/** Name the upload `audio.<ext>` from its MIME type, as speech APIs expect. */
function audioFile(data: BlobPart, type: string): File {
  const ext =
    type === 'audio/mpeg'
      ? 'mp3'
      : (type.split(/[/;]/)[1]?.replace(/^x-/, '') ?? 'mp3')
  return new File([data], `audio.${ext}`, { type })
}

/** Convert an audio input to a file for multipart transcription. */
export function toAudioFile(audio: string | File | Blob | ArrayBuffer): File {
  if (audio instanceof File) return audio
  if (audio instanceof Blob) return audioFile(audio, audio.type || 'audio/mpeg')
  if (audio instanceof ArrayBuffer) return audioFile(audio, 'audio/mpeg')
  const match = /^data:([^;,]+)(?:;[^;,]+)*;base64,(.*)$/is.exec(audio)
  if (!match && audio.startsWith('data:')) {
    throw new Error('Cartesia transcription needs a base64 data URL')
  }
  return audioFile(
    base64ToArrayBuffer(match?.[2] ?? audio),
    match?.[1] ?? 'audio/mpeg',
  )
}
