import { openLiveSocket } from '@tanstack/ai/adapter-internals'
import { getGrokApiKeyFromEnv } from '../utils'
import type { WebSocketConstructor } from '@tanstack/ai/adapter-internals'
import type { LiveTranscriptionAdapter } from '@tanstack/ai'

/** xAI models for streaming speech-to-text. */
export const GROK_LIVE_TRANSCRIPTION_MODELS = [
  'grok-voice-transcribe-2.0',
] as const

export type GrokLiveTranscriptionModel =
  (typeof GROK_LIVE_TRANSCRIPTION_MODELS)[number]

const RATES = [8000, 16000, 22050, 24000, 44100, 48000]

export interface GrokLiveTranscriptionProviderOptions {
  /** Milliseconds of silence before the utterance ends (0 to 5000). Defaults to 400. */
  endpointing?: number
  /** Format numbers, dates and so on. Needs `language`. */
  format?: boolean
  /** Terms the model should recognize. */
  keyterms?: Array<string>
  /** Keep filler words such as "um". */
  fillerWords?: boolean
  /** Other query parameters, passed as is. */
  params?: Record<string, string | number | boolean>
}

export interface GrokLiveTranscriptionConfig {
  /** Defaults to `XAI_API_KEY`. */
  apiKey?: string
  /** Defaults to `wss://api.x.ai/v1/stt`. */
  baseURL?: string
  /** Defaults to the global `WebSocket`. */
  WebSocket?: WebSocketConstructor
}

interface GrokSttMessage {
  type?: string
  text?: string
  is_final?: boolean
  speech_final?: boolean
  message?: string
}

/**
 * xAI streaming speech-to-text adapter for `transcriptionSession()`.
 * Takes linear16 PCM at 8 to 48 kHz, and G.711 μ-law and A-law at 8 kHz.
 *
 * @example
 * ```ts
 * const session = await transcriptionSession({
 *   adapter: grokLiveTranscription('grok-voice-transcribe-2.0'),
 *   audio: { encoding: 'mulaw', sampleRate: 8000 },
 * })
 * ```
 */
export function grokLiveTranscription<
  TModel extends GrokLiveTranscriptionModel,
>(
  model: TModel,
  config: GrokLiveTranscriptionConfig = {},
): LiveTranscriptionAdapter<TModel, GrokLiveTranscriptionProviderOptions> {
  return {
    kind: 'liveTranscription',
    name: 'grok',
    model,
    audioInputs: [
      { encoding: 'linear16', sampleRates: RATES },
      { encoding: 'mulaw', sampleRates: [8000] },
      { encoding: 'alaw', sampleRates: [8000] },
    ],
    '~types': {} as never,
    connect: async (options) => {
      const apiKey = config.apiKey ?? getGrokApiKeyFromEnv()
      const opts = options.modelOptions ?? {}
      const { encoding, sampleRate, channels = 1 } = options.audio
      const query = new URLSearchParams({
        model: options.model,
        encoding: encoding === 'linear16' ? 'pcm' : encoding,
        sample_rate: String(sampleRate),
        interim_results: 'true',
      })
      if (channels > 1) {
        query.set('multichannel', 'true')
        query.set('channels', String(channels))
      }
      if (options.language) query.set('language', options.language)
      if (opts.endpointing !== undefined)
        query.set('endpointing', String(opts.endpointing))
      if (opts.format) query.set('format', 'true')
      if (opts.fillerWords) query.set('filler_words', 'true')
      for (const term of opts.keyterms ?? []) query.append('keyterm', term)
      for (const [k, v] of Object.entries(opts.params ?? {}))
        query.set(k, String(v))

      // Text already emitted as `final` in the current utterance.
      let committed = ''
      const live = await openLiveSocket({
        url: `${config.baseURL ?? 'wss://api.x.ai/v1/stt'}?${query}`,
        protocols: [`xai-client-secret.${apiKey}`],
        WebSocket: config.WebSocket,
        connect: options,
        readyWhen: (m) => (m as GrokSttMessage).type === 'transcript.created',
        onMessage: (message) => {
          const m = message as GrokSttMessage
          if (m.type === 'transcript.partial') {
            const text = m.text?.trim() ?? ''
            if (!m.is_final) {
              if (text) options.emit({ type: 'interim', text })
              return
            }
            // An utterance-final repeats the whole utterance. Emit only the
            // part that earlier chunk-finals did not.
            const rest =
              m.speech_final && committed && text.startsWith(committed)
                ? text.slice(committed.length).trim()
                : text
            if (rest) options.emit({ type: 'final', text: rest })
            committed = m.speech_final ? '' : `${committed} ${rest}`.trim()
            if (m.speech_final) options.emit({ type: 'turn-end' })
          } else if (m.type === 'error') {
            options.emit({
              type: 'error',
              error: new Error(m.message ?? 'xAI speech-to-text error'),
            })
          }
        },
      })

      return {
        send: (audio) => live.sendBinary(audio),
        // The server flushes, sends `transcript.done`, then closes.
        close: () => live.finish({ type: 'audio.done' }),
      }
    },
  }
}
