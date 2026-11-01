import { bytesToBase64, openLiveSocket } from '@tanstack/ai/adapter-internals'
import { getElevenLabsApiKeyFromEnv } from '../utils/client'
import type { WebSocketConstructor } from '@tanstack/ai/adapter-internals'
import type { LiveTranscriptionAdapter } from '@tanstack/ai'

/** ElevenLabs Scribe models for realtime speech-to-text. */
export const ELEVENLABS_LIVE_TRANSCRIPTION_MODELS = [
  'scribe_v2_realtime',
] as const

export type ElevenLabsLiveTranscriptionModel =
  (typeof ELEVENLABS_LIVE_TRANSCRIPTION_MODELS)[number]

const PCM_RATES = [8000, 16000, 22050, 24000, 44100, 48000]

export interface ElevenLabsLiveTranscriptionProviderOptions {
  /**
   * `vad` (default) commits text when the speaker pauses, and each commit is a
   * `turn-end`. `manual` commits only when the session closes.
   */
  commitStrategy?: 'vad' | 'manual'
  /** Seconds of silence before a VAD commit (0.3 to 3.0). */
  vadSilenceThresholdSecs?: number
  /** VAD sensitivity. */
  vadThreshold?: number
  minSpeechDurationMs?: number
  minSilenceDurationMs?: number
  /** Terms the model should recognize. */
  keyterms?: Array<string>
  /** Other query parameters, passed as is. */
  params?: Record<string, string | number | boolean>
}

export interface ElevenLabsLiveTranscriptionConfig {
  /** Defaults to `ELEVENLABS_API_KEY`. */
  apiKey?: string
  /** Defaults to `https://api.elevenlabs.io`. Use a regional host if you need one. */
  baseURL?: string
  /** Used to mint the single-use token. Defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Defaults to the global `WebSocket`. */
  WebSocket?: WebSocketConstructor
}

interface ScribeMessage {
  message_type?: string
  text?: string
  error?: string
}

/**
 * ElevenLabs Scribe realtime adapter for `transcriptionSession()`.
 * Takes linear16 PCM at 8 to 48 kHz and G.711 μ-law at 8 kHz.
 *
 * @example
 * ```ts
 * const session = await transcriptionSession({
 *   adapter: elevenlabsLiveTranscription('scribe_v2_realtime'),
 *   audio: { encoding: 'mulaw', sampleRate: 8000 },
 * })
 * ```
 */
export function elevenlabsLiveTranscription<
  TModel extends ElevenLabsLiveTranscriptionModel,
>(
  model: TModel,
  config: ElevenLabsLiveTranscriptionConfig = {},
): LiveTranscriptionAdapter<
  TModel,
  ElevenLabsLiveTranscriptionProviderOptions
> {
  return {
    kind: 'liveTranscription',
    name: 'elevenlabs',
    model,
    audioInputs: [
      { encoding: 'linear16', sampleRates: PCM_RATES },
      { encoding: 'mulaw', sampleRates: [8000] },
    ],
    '~types': {} as never,
    connect: async (options) => {
      const base = config.baseURL ?? 'https://api.elevenlabs.io'
      const apiKey = config.apiKey ?? getElevenLabsApiKeyFromEnv()
      const res = await (config.fetch ?? fetch)(
        `${base}/v1/single-use-token/realtime_scribe`,
        {
          method: 'POST',
          headers: { 'xi-api-key': apiKey },
          signal: options.abortSignal,
        },
      )
      if (!res.ok) {
        throw new Error(
          `ElevenLabs token request failed (${res.status}): ${await res.text()}`,
        )
      }
      const { token } = (await res.json()) as { token: string }

      const opts = options.modelOptions ?? {}
      const { sampleRate, encoding } = options.audio
      const query = new URLSearchParams({
        model_id: options.model,
        audio_format: encoding === 'mulaw' ? 'ulaw_8000' : `pcm_${sampleRate}`,
        commit_strategy: opts.commitStrategy ?? 'vad',
        token,
      })
      if (options.language) query.set('language_code', options.language)
      if (opts.vadSilenceThresholdSecs !== undefined)
        query.set(
          'vad_silence_threshold_secs',
          String(opts.vadSilenceThresholdSecs),
        )
      if (opts.vadThreshold !== undefined)
        query.set('vad_threshold', String(opts.vadThreshold))
      if (opts.minSpeechDurationMs !== undefined)
        query.set('min_speech_duration_ms', String(opts.minSpeechDurationMs))
      if (opts.minSilenceDurationMs !== undefined)
        query.set('min_silence_duration_ms', String(opts.minSilenceDurationMs))
      for (const term of opts.keyterms ?? []) query.append('keyterms', term)
      for (const [k, v] of Object.entries(opts.params ?? {}))
        query.set(k, String(v))

      let lastInterim = ''
      const live = await openLiveSocket({
        url: `${base.replace(/^http/, 'ws')}/v1/speech-to-text/realtime?${query}`,
        WebSocket: config.WebSocket,
        connect: options,
        onMessage: (message, socket) => {
          const m = message as ScribeMessage
          if (m.message_type === 'partial_transcript') {
            // Partials double as keepalives, so skip repeats.
            const text = m.text?.trim() ?? ''
            if (text && text !== lastInterim) {
              lastInterim = text
              options.emit({ type: 'interim', text })
            }
          } else if (m.message_type === 'committed_transcript') {
            lastInterim = ''
            const text = m.text?.trim()
            if (text) options.emit({ type: 'final', text })
            options.emit({ type: 'turn-end' })
            if (socket.closing) socket.close()
          } else if (m.error) {
            options.emit({
              type: 'error',
              error: new Error(`ElevenLabs ${m.message_type}: ${m.error}`),
            })
          }
        },
      })

      const chunk = (audio: string, commit: boolean) => ({
        message_type: 'input_audio_chunk',
        audio_base_64: audio,
        commit,
        sample_rate: sampleRate,
      })
      return {
        send: (audio) => live.sendJson(chunk(bytesToBase64(audio), false)),
        close: () => live.finish(chunk('', true)),
      }
    },
  }
}
