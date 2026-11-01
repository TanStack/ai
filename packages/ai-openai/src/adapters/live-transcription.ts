import { bytesToBase64, openLiveSocket } from '@tanstack/ai/adapter-internals'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type { WebSocketConstructor } from '@tanstack/ai/adapter-internals'
import type { LiveTranscriptionAdapter } from '@tanstack/ai'
import type { OpenAITurnDetection } from '../realtime/types'

/** OpenAI models for realtime transcription sessions. */
export const OPENAI_LIVE_TRANSCRIPTION_MODELS = [
  'gpt-live-transcribe',
  'gpt-transcribe',
  'gpt-realtime-whisper',
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
] as const

export type OpenAILiveTranscriptionModel =
  (typeof OPENAI_LIVE_TRANSCRIPTION_MODELS)[number]

/** Models with no server voice activity detection, so no `turn-end` events. */
const NO_VAD_MODELS: ReadonlyArray<string> = [
  'gpt-live-transcribe',
  'gpt-realtime-whisper',
]

export interface OpenAILiveTranscriptionProviderOptions {
  /** Words or phrases that guide the model. */
  prompt?: string
  /** Terms the model should recognize (`gpt-transcribe`, `gpt-live-transcribe`). */
  keywords?: Array<string>
  /**
   * Turn detection. Defaults to `server_vad` on models that support it, and to
   * `null` (none) on `gpt-live-transcribe` and `gpt-realtime-whisper`.
   */
  turnDetection?: OpenAITurnDetection
  noiseReduction?: { type: 'near_field' | 'far_field' } | null
}

export interface OpenAILiveTranscriptionConfig {
  /** Defaults to `OPENAI_API_KEY`. */
  apiKey?: string
  /** Defaults to `wss://api.openai.com/v1/realtime`. */
  baseURL?: string
  /** Defaults to the global `WebSocket`. */
  WebSocket?: WebSocketConstructor
}

function toWireTurnDetection(td: OpenAITurnDetection) {
  if (!td) return null
  if (td.type === 'semantic_vad') {
    return { type: td.type, eagerness: td.eagerness }
  }
  return {
    type: td.type,
    threshold: td.threshold,
    prefix_padding_ms: td.prefixPaddingMs,
    silence_duration_ms: td.silenceDurationMs,
  }
}

interface OpenAIRealtimeEvent {
  type?: string
  item_id?: string
  delta?: string
  transcript?: string
  error?: { message?: string }
}

/**
 * OpenAI realtime transcription adapter for `transcriptionSession()`.
 * Takes 24 kHz PCM, G.711 μ-law, and G.711 A-law.
 *
 * @example
 * ```ts
 * const session = await transcriptionSession({
 *   adapter: openaiLiveTranscription('gpt-transcribe'),
 *   audio: { encoding: 'mulaw', sampleRate: 8000 },
 * })
 * ```
 */
export function openaiLiveTranscription<
  TModel extends OpenAILiveTranscriptionModel,
>(
  model: TModel,
  config: OpenAILiveTranscriptionConfig = {},
): LiveTranscriptionAdapter<TModel, OpenAILiveTranscriptionProviderOptions> {
  return {
    kind: 'liveTranscription',
    name: 'openai',
    model,
    audioInputs: [
      { encoding: 'linear16', sampleRates: [24000] },
      { encoding: 'mulaw', sampleRates: [8000] },
      { encoding: 'alaw', sampleRates: [8000] },
    ],
    '~types': {} as never,
    connect: async (options) => {
      const apiKey = config.apiKey ?? getOpenAIApiKeyFromEnv()
      const opts = options.modelOptions ?? {}
      const noVad = NO_VAD_MODELS.includes(options.model)
      const format =
        options.audio.encoding === 'mulaw'
          ? { type: 'audio/pcmu' }
          : options.audio.encoding === 'alaw'
            ? { type: 'audio/pcma' }
            : { type: 'audio/pcm', rate: 24000 }
      // Deltas per item, joined into one interim text.
      const interim = new Map<string, string>()
      // Speech or text with no final yet. When there is none, close does not wait.
      let pending = false

      const live = await openLiveSocket({
        url: `${config.baseURL ?? 'wss://api.openai.com/v1/realtime'}?intent=transcription`,
        protocols: ['realtime', `openai-insecure-api-key.${apiKey}`],
        WebSocket: config.WebSocket,
        connect: options,
        readyWhen: (m) => (m as OpenAIRealtimeEvent).type === 'session.updated',
        onOpen: (socket) =>
          socket.sendJson({
            type: 'session.update',
            session: {
              type: 'transcription',
              audio: {
                input: {
                  format,
                  transcription: {
                    model: options.model,
                    ...(options.language &&
                      (options.model === 'gpt-live-transcribe'
                        ? { languages: [options.language] }
                        : { language: options.language })),
                    ...(opts.prompt && { prompt: opts.prompt }),
                    ...(opts.keywords && { keywords: opts.keywords }),
                  },
                  turn_detection: toWireTurnDetection(
                    opts.turnDetection === undefined
                      ? noVad
                        ? null
                        : { type: 'server_vad' }
                      : opts.turnDetection,
                  ),
                  ...(opts.noiseReduction !== undefined && {
                    noise_reduction: opts.noiseReduction,
                  }),
                },
              },
            },
          }),
        onMessage: (message, socket) => {
          const m = message as OpenAIRealtimeEvent
          switch (m.type ?? '') {
            case 'input_audio_buffer.speech_started':
              pending = true
              break
            case 'conversation.item.input_audio_transcription.delta': {
              pending = true
              const text =
                (interim.get(m.item_id ?? '') ?? '') + (m.delta ?? '')
              interim.set(m.item_id ?? '', text)
              if (text.trim())
                options.emit({ type: 'interim', text: text.trim() })
              break
            }
            case 'conversation.item.input_audio_transcription.completed': {
              interim.delete(m.item_id ?? '')
              pending = interim.size > 0
              const text = m.transcript?.trim()
              if (text) options.emit({ type: 'final', text })
              if (!noVad || socket.closing) options.emit({ type: 'turn-end' })
              if (socket.closing) socket.close()
              break
            }
            case 'conversation.item.input_audio_transcription.failed':
            case 'error':
              // An empty buffer cannot be committed when closing. Not an error.
              if (socket.closing) socket.close()
              else
                options.emit({
                  type: 'error',
                  error: new Error(m.error?.message ?? 'OpenAI realtime error'),
                })
              break
          }
        },
      })

      return {
        send: (audio) =>
          live.sendJson({
            type: 'input_audio_buffer.append',
            audio: bytesToBase64(audio),
          }),
        close: () =>
          live.finish(
            { type: 'input_audio_buffer.commit' },
            pending ? 5000 : 0,
          ),
      }
    },
  }
}
