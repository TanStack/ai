import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { resolveConfigFromEnv } from '../utils/config'
import { outputToBase64, runModel } from '../utils/run'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type { CloudflareConfig, CloudflareConfigInput } from '../utils/config'
import type { CloudflareTTSModel } from '../utils/models'

/** Text-to-speech inputs forwarded to the model (Deepgram Aura fields). */
export interface CloudflareTTSProviderOptions {
  speaker?: string
  encoding?: 'linear16' | 'flac' | 'mulaw' | 'alaw' | 'mp3' | 'opus' | 'aac'
  container?: 'none' | 'wav' | 'ogg'
  sample_rate?: number
  bit_rate?: number
  [key: string]: unknown
}

const CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/opus',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  pcm: 'audio/pcm',
}

/**
 * Cloudflare text-to-speech adapter for Workers AI models such as Deepgram
 * Aura. `voice` maps to `speaker` and `format` to `encoding`; the audio comes
 * back base64-encoded.
 */
export class CloudflareTTSAdapter<
  TModel extends CloudflareTTSModel,
> extends BaseTTSAdapter<TModel, CloudflareTTSProviderOptions> {
  readonly name = 'cloudflare' as const

  constructor(
    private readonly cfConfig: CloudflareConfig,
    model: TModel,
  ) {
    super(model, {})
  }

  async generateSpeech(
    options: TTSOptions<CloudflareTTSProviderOptions>,
  ): Promise<TTSResult> {
    const { model, logger, text, voice, format = 'mp3' } = options
    const inputs = {
      ...(voice && { speaker: voice }),
      // Aura takes the codec as `encoding` and the wrapper as `container`;
      // `wav` and `pcm` are both linear16.
      encoding: format === 'wav' || format === 'pcm' ? 'linear16' : format,
      ...(format === 'wav' && { container: 'wav' }),
      ...options.modelOptions,
      text,
    }
    try {
      logger.request(
        `activity=tts provider=${this.name} model=${model} chars=${text.length}`,
        { provider: this.name, model },
      )
      const output = await runModel(this.cfConfig, model, inputs, {
        signal: options.abortSignal,
      })
      const audio =
        output && typeof output === 'object' && 'audio' in output
          ? (output as { audio: string }).audio
          : await outputToBase64(output)
      return {
        id: generateId(this.name),
        model,
        audio,
        format,
        contentType: CONTENT_TYPES[format],
      }
    } catch (error: unknown) {
      logger.errors(`${this.name}.generateSpeech fatal`, {
        error: toRunErrorPayload(error, `${this.name}.generateSpeech failed`),
        source: `${this.name}.generateSpeech`,
      })
      throw error
    }
  }
}

export function createCloudflareTTS<TModel extends CloudflareTTSModel>(
  model: TModel,
  config: CloudflareConfig,
): CloudflareTTSAdapter<TModel> {
  return new CloudflareTTSAdapter(config, model)
}

export function cloudflareTTS<TModel extends CloudflareTTSModel>(
  model: TModel,
  config?: CloudflareConfigInput,
): CloudflareTTSAdapter<TModel> {
  return new CloudflareTTSAdapter(resolveConfigFromEnv(config), model)
}
