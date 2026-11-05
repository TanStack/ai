import { openLiveSocket } from '@tanstack/ai/adapter-internals'
import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { WebSocketConstructor } from '@tanstack/ai/adapter-internals'
import type { LiveTranscriptionAdapter } from '@tanstack/ai'

/** Nova models stream on `/v1/listen`. */
export const DEEPGRAM_NOVA_MODELS = [
  'nova-3',
  'nova-3-general',
  'nova-3-medical',
  'nova-2',
  'nova-2-phonecall',
] as const

/** Flux models stream on `/v2/listen` and have built-in turn detection. */
export const DEEPGRAM_FLUX_MODELS = [
  'flux-general-en',
  'flux-general-multi',
] as const

export const DEEPGRAM_LIVE_TRANSCRIPTION_MODELS = [
  ...DEEPGRAM_NOVA_MODELS,
  ...DEEPGRAM_FLUX_MODELS,
] as const

export type DeepgramLiveTranscriptionModel =
  (typeof DEEPGRAM_LIVE_TRANSCRIPTION_MODELS)[number]

export interface DeepgramLiveTranscriptionProviderOptions {
  /** Terms the model should recognize (Nova-3 and Flux). */
  keyterms?: Array<string>
  /** Nova: milliseconds of silence that end an utterance, or `false`. */
  endpointing?: number | false
  /** Nova: send a `turn-end` after this many ms with no new words. */
  utteranceEndMs?: number
  /** Nova: format numbers, dates, and so on. */
  smartFormat?: boolean
  /** Flux: end-of-turn confidence threshold. Defaults to 0.7. */
  eotThreshold?: number
  /** Flux: end the turn after this many ms of silence. Defaults to 5000. */
  eotTimeoutMs?: number
  /** Other query parameters, passed as is. */
  params?: Record<string, string | number | boolean>
}

export interface DeepgramLiveTranscriptionConfig {
  /** Defaults to `DEEPGRAM_API_KEY`. */
  apiKey?: string
  /** Defaults to `wss://api.deepgram.com`. */
  baseURL?: string
  /** Defaults to the global `WebSocket`. */
  WebSocket?: WebSocketConstructor
  /**
   * Open the socket yourself, for example through the Workers AI binding.
   * Gets the query parameters the adapter would send, and returns an open
   * socket. `apiKey`, `baseURL` and `WebSocket` are then not used.
   */
  openSocket?: (query: URLSearchParams) => Promise<WebSocket>
}

interface DeepgramMessage {
  type?: string
  // Nova `Results`
  is_final?: boolean
  speech_final?: boolean
  channel?: { alternatives?: Array<{ transcript?: string }> }
  // Flux `TurnInfo`
  event?: string
  transcript?: string
  // `Error`
  description?: string
  message?: string
}

const FLUX_RATES = [8000, 16000, 24000, 44100, 48000]

/**
 * Deepgram live speech-to-text adapter for `transcriptionSession()`.
 * Nova models take linear16, μ-law, and A-law at any rate. Flux models take
 * them at 8, 16, 24, 44.1, and 48 kHz, and detect turns.
 *
 * @example
 * ```ts
 * const session = await transcriptionSession({
 *   adapter: deepgramLiveTranscription('nova-3'),
 *   audio: { encoding: 'mulaw', sampleRate: 8000 },
 * })
 * ```
 */
export function deepgramLiveTranscription<
  TModel extends DeepgramLiveTranscriptionModel,
>(
  model: TModel,
  config: DeepgramLiveTranscriptionConfig = {},
): LiveTranscriptionAdapter<TModel, DeepgramLiveTranscriptionProviderOptions> {
  const flux = model.startsWith('flux')
  const rates = flux ? FLUX_RATES : undefined
  return {
    kind: 'liveTranscription',
    name: 'deepgram',
    model,
    audioInputs: [
      { encoding: 'linear16', sampleRates: rates },
      { encoding: 'mulaw', sampleRates: rates },
      { encoding: 'alaw', sampleRates: rates },
    ],
    '~types': {} as never,
    connect: async (options) => {
      const opts = options.modelOptions ?? {}
      const { encoding, sampleRate, channels = 1 } = options.audio
      const query = new URLSearchParams({
        model: options.model,
        encoding,
        sample_rate: String(sampleRate),
      })
      if (flux) {
        if (opts.eotThreshold !== undefined)
          query.set('eot_threshold', String(opts.eotThreshold))
        if (opts.eotTimeoutMs !== undefined)
          query.set('eot_timeout_ms', String(opts.eotTimeoutMs))
      } else {
        query.set('interim_results', 'true')
        query.set('channels', String(channels))
        if (options.language) query.set('language', options.language)
        if (opts.endpointing !== undefined)
          query.set('endpointing', String(opts.endpointing))
        if (opts.utteranceEndMs !== undefined)
          query.set('utterance_end_ms', String(opts.utteranceEndMs))
        if (opts.smartFormat) query.set('smart_format', 'true')
      }
      for (const term of opts.keyterms ?? []) query.append('keyterm', term)
      for (const [k, v] of Object.entries(opts.params ?? {}))
        query.set(k, String(v))

      // Nova sends both `speech_final` and `UtteranceEnd`; emit one turn-end.
      let speaking = false
      const live = await openLiveSocket({
        ...(config.openSocket
          ? { socket: await config.openSocket(query) }
          : {
              url: `${config.baseURL ?? 'wss://api.deepgram.com'}/${flux ? 'v2' : 'v1'}/listen?${query}`,
              protocols: [
                'token',
                config.apiKey ?? getApiKeyFromEnv('DEEPGRAM_API_KEY'),
              ],
              WebSocket: config.WebSocket,
            }),
        connect: options,
        onMessage: (message, socket) => {
          const m = message as DeepgramMessage
          if (m.type === 'Results') {
            const text = m.channel?.alternatives?.[0]?.transcript?.trim()
            if (text) {
              speaking = true
              options.emit({ type: m.is_final ? 'final' : 'interim', text })
            }
            if (m.speech_final && speaking) {
              speaking = false
              options.emit({ type: 'turn-end' })
            }
          } else if (m.type === 'UtteranceEnd') {
            if (speaking) options.emit({ type: 'turn-end' })
            speaking = false
          } else if (m.type === 'TurnInfo') {
            const text = m.transcript?.trim()
            if (m.event === 'EndOfTurn') {
              if (text) options.emit({ type: 'final', text })
              options.emit({ type: 'turn-end' })
            } else if (text) {
              options.emit({ type: 'interim', text })
            }
          } else if (m.type === 'Error') {
            socket.fail(
              new Error(
                m.description ?? m.message ?? 'Deepgram streaming error',
              ),
            )
          }
        },
      })

      return {
        send: (audio) => live.sendBinary(audio),
        // Deepgram flushes, sends its last results, then closes the socket.
        close: () => live.finish({ type: 'CloseStream' }),
      }
    },
  }
}
