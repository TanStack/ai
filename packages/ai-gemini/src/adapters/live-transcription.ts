import { bytesToBase64, openLiveSocket } from '@tanstack/ai/adapter-internals'
import { getGeminiApiKeyFromEnv } from '../utils/client'
import type { WebSocketConstructor } from '@tanstack/ai/adapter-internals'
import type { LiveTranscriptionAdapter } from '@tanstack/ai'

/** Gemini Live models for transcription-only sessions. */
export const GEMINI_LIVE_TRANSCRIPTION_MODELS = [
  'gemini-3.5-transcribe-live',
] as const

export type GeminiLiveTranscriptionModel =
  (typeof GEMINI_LIVE_TRANSCRIPTION_MODELS)[number]

export interface GeminiLiveTranscriptionProviderOptions {
  /** Terms the model should recognize (up to 1000). */
  customVocabulary?: Array<string>
  /** `VERBATIM` (default) keeps disfluencies. `SMART` removes them. */
  mode?: 'VERBATIM' | 'SMART'
  /** Automatic voice activity detection settings. */
  automaticActivityDetection?: {
    startOfSpeechSensitivity?:
      | 'START_SENSITIVITY_LOW'
      | 'START_SENSITIVITY_HIGH'
    endOfSpeechSensitivity?: 'END_SENSITIVITY_LOW' | 'END_SENSITIVITY_HIGH'
    prefixPaddingMs?: number
    silenceDurationMs?: number
  }
}

export interface GeminiLiveTranscriptionConfig {
  /** Defaults to `GOOGLE_API_KEY`, then `GEMINI_API_KEY`. */
  apiKey?: string
  /** Defaults to the Gemini Live `BidiGenerateContent` endpoint. */
  baseURL?: string
  /** Defaults to the global `WebSocket`. */
  WebSocket?: WebSocketConstructor
}

interface LiveServerMessage {
  setupComplete?: object
  serverContent?: {
    interimInputTranscription?: { text?: string }
    inputTranscription?: { text?: string }
  }
}

const DEFAULT_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

/**
 * Gemini Live transcription adapter for `transcriptionSession()`.
 * Takes 16 kHz linear16 PCM. Other formats, such as μ-law phone audio, are
 * converted by the session.
 *
 * Gemini Live sessions last up to 10 minutes.
 *
 * @example
 * ```ts
 * const session = await transcriptionSession({
 *   adapter: geminiLiveTranscription('gemini-3.5-transcribe-live'),
 *   audio: { encoding: 'mulaw', sampleRate: 8000 },
 * })
 * ```
 */
export function geminiLiveTranscription<
  TModel extends GeminiLiveTranscriptionModel,
>(
  model: TModel,
  config: GeminiLiveTranscriptionConfig = {},
): LiveTranscriptionAdapter<TModel, GeminiLiveTranscriptionProviderOptions> {
  return {
    kind: 'liveTranscription',
    name: 'gemini',
    model,
    audioInputs: [{ encoding: 'linear16', sampleRates: [16000] }],
    '~types': {} as never,
    connect: async (options) => {
      const apiKey = config.apiKey ?? getGeminiApiKeyFromEnv()
      const opts = options.modelOptions ?? {}
      const mimeType = `audio/pcm;rate=${options.audio.sampleRate}`
      // Audio or text with no final yet. When there is none, close does not wait.
      let pending = false

      const live = await openLiveSocket({
        url: `${config.baseURL ?? DEFAULT_URL}?key=${encodeURIComponent(apiKey)}`,
        WebSocket: config.WebSocket,
        connect: options,
        readyWhen: (m) => !!(m as LiveServerMessage).setupComplete,
        onOpen: (socket) =>
          socket.sendJson({
            setup: {
              model: `models/${options.model}`,
              generationConfig: { responseModalities: ['TEXT'] },
              inputAudioTranscription: {
                ...(options.language && { languageCodes: [options.language] }),
                ...(opts.customVocabulary && {
                  customVocabulary: opts.customVocabulary,
                }),
                ...(opts.mode && { mode: opts.mode }),
              },
              ...(opts.automaticActivityDetection && {
                realtimeInputConfig: {
                  automaticActivityDetection: opts.automaticActivityDetection,
                },
              }),
            },
          }),
        onMessage: (message, socket) => {
          const content = (message as LiveServerMessage).serverContent
          const interim = content?.interimInputTranscription?.text?.trim()
          if (interim) {
            pending = true
            options.emit({ type: 'interim', text: interim })
          }
          const final = content?.inputTranscription
          if (final) {
            pending = false
            const text = final.text?.trim()
            if (text) options.emit({ type: 'final', text })
            // Each final covers one speech segment, ended by a pause.
            options.emit({ type: 'turn-end' })
            if (socket.closing) socket.close()
          }
        },
      })

      return {
        send: (audio) => {
          pending = true
          live.sendJson({
            realtimeInput: { audio: { data: bytesToBase64(audio), mimeType } },
          })
        },
        close: () =>
          live.finish(
            { realtimeInput: { audioStreamEnd: true } },
            pending ? 5000 : 0,
          ),
      }
    },
  }
}
