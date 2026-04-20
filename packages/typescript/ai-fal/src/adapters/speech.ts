import { fal } from '@fal-ai/client'
import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import {
  arrayBufferToBase64,
  configureFalClient,
  generateId as utilGenerateId,
} from '../utils'
import type { OutputType, Result } from '@fal-ai/client'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type { FalClientConfig } from '../utils'
import type { FalModel, FalModelInput } from '../model-meta'

/**
 * Provider options for TTS, excluding fields TanStack AI handles.
 */
export type FalSpeechProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'prompt' | 'text'
>

/**
 * fal.ai text-to-speech adapter.
 *
 * Supports fal.ai TTS models like kokoro, elevenlabs, etc.
 *
 * @example
 * ```typescript
 * const adapter = falSpeech('fal-ai/kokoro/american-english')
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'Hello, world!',
 *   voice: 'af_heart',
 * })
 * ```
 */
export class FalSpeechAdapter<TModel extends FalModel> extends BaseTTSAdapter<
  TModel,
  FalSpeechProviderOptions<TModel>
> {
  readonly name = 'fal' as const

  constructor(model: TModel, config?: FalClientConfig) {
    super({}, model)
    configureFalClient(config)
  }

  async generateSpeech(
    options: TTSOptions<FalSpeechProviderOptions<TModel>>,
  ): Promise<TTSResult> {
    const input = this.buildInput(options)
    const result = await fal.subscribe(this.model, { input })
    return this.transformResponse(result)
  }

  private buildInput(
    options: TTSOptions<FalSpeechProviderOptions<TModel>>,
  ): FalModelInput<TModel> {
    const input = {
      ...options.modelOptions,
      // Map text to both prompt and text fields (different models use different fields)
      prompt: options.text,
      text: options.text,
      ...(options.voice ? { voice: options.voice } : {}),
      ...(options.speed ? { speed: options.speed } : {}),
    } as FalModelInput<TModel>
    return input
  }

  protected override generateId(): string {
    return utilGenerateId(this.name)
  }

  private async transformResponse(
    response: Result<OutputType<TModel>>,
  ): Promise<TTSResult> {
    const data = response.data as Record<string, unknown>

    // fal returns { audio: { url, content_type } } or { audio_url: string }
    let audioUrl: string | undefined
    let contentType: string | undefined

    if (data.audio && typeof data.audio === 'object' && 'url' in data.audio) {
      const audioObj = data.audio as { url: string; content_type?: string }
      audioUrl = audioObj.url
      contentType = audioObj.content_type
    } else if (typeof data.audio_url === 'string') {
      audioUrl = data.audio_url
    }

    if (!audioUrl) {
      throw new Error('Audio URL not found in fal TTS response')
    }

    // Fetch the audio and convert to base64 to match TTSResult contract.
    // Using a chunked helper here — spreading Uint8Array into btoa exceeds
    // V8's argument limit (~65k) for any realistic TTS clip.
    const audioResponse = await fetch(audioUrl)
    const arrayBuffer = await audioResponse.arrayBuffer()
    const base64 = arrayBufferToBase64(arrayBuffer)

    const format =
      contentType?.split('/')[1] ||
      audioUrl.split('.').pop()?.split('?')[0] ||
      'wav'

    return {
      id: response.requestId || this.generateId(),
      model: this.model,
      audio: base64,
      format,
      contentType: contentType || `audio/${format}`,
    }
  }
}

export function falSpeech<TModel extends FalModel>(
  model: TModel,
  config?: FalClientConfig,
): FalSpeechAdapter<TModel> {
  return new FalSpeechAdapter(model, config)
}
