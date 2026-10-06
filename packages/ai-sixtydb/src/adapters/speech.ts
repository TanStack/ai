import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import { arrayBufferToBase64, generateId } from '@tanstack/ai-utils'
import { asWav, readAudio, SAMPLE_RATE } from '../audio'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type { SixtyDBTTSModel } from '../model-meta'

export interface SixtyDBSpeechConfig {
  apiKey?: string
  /** Default voice belonging to the authenticated workspace. */
  voiceId?: string
  baseURL?: string
  defaultHeaders?: Record<string, string>
  fetch?: typeof fetch
}

export interface SixtyDBSpeechProviderOptions {
  /** Target speaking rate, between 60 and 300 words per minute. */
  wpm?: number
  /** Voice consistency, an integer from 0 to 100. */
  stability?: number
  /** Voice match fidelity, an integer from 0 to 100. */
  similarity?: number
  /** Cross-lingual synthesis hint, such as "en" or "hi". */
  targetLanguage?: string
}

export class SixtyDBSpeechAdapter extends BaseTTSAdapter<
  SixtyDBTTSModel,
  SixtyDBSpeechProviderOptions
> {
  readonly name = 'sixtydb' as const
  private readonly apiKey: string
  private readonly endpoint: string
  private readonly headers: Headers
  private readonly fetchImpl: typeof fetch
  private readonly voiceId: string | undefined

  constructor(model: SixtyDBTTSModel, config: SixtyDBSpeechConfig = {}) {
    super(model)
    if (model !== 'tts')
      throw new Error('60db speech supports the tts endpoint model')
    const apiKey =
      config.apiKey ??
      (typeof process !== 'undefined' ? process.env.SIXTYDB_API_KEY : undefined)
    if (!apiKey?.trim())
      throw new Error('Set SIXTYDB_API_KEY or pass an explicit 60db API key')
    this.apiKey = apiKey.trim()
    this.voiceId = config.voiceId
    const base = new URL(config.baseURL ?? 'https://api.60db.ai')
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
    if (
      (base.protocol !== 'https:' &&
        !(base.protocol === 'http:' && loopback)) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    ) {
      throw new Error(
        '60db baseURL must use HTTPS or loopback HTTP without credentials, query, or fragment',
      )
    }
    this.endpoint = `${base.href.replace(/\/$/, '')}/tts-synthesize`
    this.headers = new Headers(config.defaultHeaders)
    this.headers.set('Authorization', `Bearer ${this.apiKey}`)
    this.headers.set('Content-Type', 'application/json')
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis)
  }

  async generateSpeech(
    options: TTSOptions<SixtyDBSpeechProviderOptions>,
  ): Promise<TTSResult> {
    const { text, speed = 1, format = 'wav', modelOptions, logger } = options
    const voice = options.voice ?? this.voiceId
    if (!text.trim() || [...text].length > 5000)
      throw new Error('60db speech requires 1 to 5000 characters of text')
    if (!voice?.trim())
      throw new Error('60db speech requires an explicit workspace voice ID')
    if (!Number.isFinite(speed) || speed < 0.5 || speed > 2)
      throw new Error('60db speech speed must be between 0.5 and 2')
    if (format !== 'wav' && format !== 'pcm')
      throw new Error('60db speech supports wav and pcm output')
    if (options.turns || options.timestamps)
      throw new Error(
        '60db speech does not support dialogue turns or alignment',
      )
    const { wpm, stability, similarity, targetLanguage } = modelOptions ?? {}
    if (wpm !== undefined && (!Number.isFinite(wpm) || wpm < 60 || wpm > 300))
      throw new Error('60db wpm must be between 60 and 300')
    for (const [name, value] of [
      ['stability', stability],
      ['similarity', similarity],
    ] as const) {
      if (
        value !== undefined &&
        (!Number.isInteger(value) || value < 0 || value > 100)
      )
        throw new Error(`60db ${name} must be an integer between 0 and 100`)
    }
    if (targetLanguage !== undefined && !targetLanguage.trim())
      throw new Error('60db targetLanguage must not be empty')
    logger.request('activity=tts provider=sixtydb model=tts', {
      provider: this.name,
      model: this.model,
    })
    try {
      options.abortSignal?.throwIfAborted()
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: this.headers,
        redirect: 'error',
        ...(options.abortSignal ? { signal: options.abortSignal } : {}),
        body: JSON.stringify({
          text,
          voice_id: voice,
          speed,
          audio_config: {
            audio_encoding: 'LINEAR16',
            sample_rate_hertz: SAMPLE_RATE,
          },
          timestamp_type: 'NONE',
          ...(wpm !== undefined && { wpm }),
          ...(stability !== undefined && { stability }),
          ...(similarity !== undefined && { similarity }),
          ...(targetLanguage !== undefined && {
            target_language: targetLanguage,
          }),
        }),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`60db synthesis failed (HTTP ${response.status})`)
      }
      const samples = await readAudio(response)
      const bytes = format === 'wav' ? asWav(samples) : samples
      return {
        id: generateId(this.name),
        model: this.model,
        audio: arrayBufferToBase64(Uint8Array.from(bytes).buffer),
        format,
        contentType: format === 'wav' ? 'audio/wav' : 'audio/pcm',
        duration: samples.length / (SAMPLE_RATE * 2),
      }
    } catch (error: unknown) {
      if (options.abortSignal?.aborted) throw options.abortSignal.reason
      // A custom fetch can throw an error containing credentials or request data.
      const message =
        error instanceof Error
          ? error.message.replaceAll(this.apiKey, '[redacted]')
          : '60db synthesis failed'
      logger.errors('sixtydb.generateSpeech failed', {
        source: 'sixtydb.generateSpeech',
      })
      throw new Error(message)
    }
  }
}

/** Use the workspace-selected synthesis model through the tts endpoint. */
export function sixtydbSpeech(
  model: SixtyDBTTSModel = 'tts',
  config?: SixtyDBSpeechConfig,
): SixtyDBSpeechAdapter {
  return new SixtyDBSpeechAdapter(model, config)
}

/** Create a speech adapter with an explicit API key. */
export function createSixtyDBSpeech(
  model: SixtyDBTTSModel,
  apiKey: string,
  config?: Omit<SixtyDBSpeechConfig, 'apiKey'>,
): SixtyDBSpeechAdapter {
  return new SixtyDBSpeechAdapter(model, { ...config, apiKey })
}
