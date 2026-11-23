import { bytesToBase64, openLiveSocket } from '@tanstack/ai/adapter-internals'
import { getGeminiApiKeyFromEnv } from '../utils/client'
import type {
  LiveSocket,
  WebSocketConstructor,
} from '@tanstack/ai/adapter-internals'
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
  /**
   * `VERBATIM` (default) keeps disfluencies. `SMART` is not supported yet:
   * `transcriptionSession()` rejects it, because its finals repeat earlier text.
   */
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
 * Takes linear16 PCM at 16 or 24 kHz. Other formats, such as μ-law phone
 * audio, are converted by the session.
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
    audioInputs: [{ encoding: 'linear16', sampleRates: [16000, 24000] }],
    '~types': {} as never,
    connect: async (options) => {
      const opts = options.modelOptions ?? {}
      // SMART finals hold the whole text so far, not one segment. A `final`
      // event must be one segment, so SMART cannot be used here yet.
      if (opts.mode === 'SMART') {
        throw new Error(
          "Gemini live transcription does not support mode 'SMART' yet: its finals repeat earlier text. Use 'VERBATIM'.",
        )
      }
      const apiKey = config.apiKey ?? getGeminiApiKeyFromEnv()
      const mimeType = `audio/pcm;rate=${options.audio.sampleRate}`
      // With no audio sent, close does not wait.
      let sentAudio = false
      // While closing: close 1 s after the last final, unless more interim
      // text arrives first. Gemini sends no segment ids, so a final cannot
      // tell if it was the last one.
      // ponytail: fixed 1 s grace. Make it an option if a provider is slower.
      let grace: ReturnType<typeof setTimeout> | undefined
      const closeSoon = (socket: LiveSocket) => {
        clearTimeout(grace)
        grace = setTimeout(() => socket.close(), 1000)
      }

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
            clearTimeout(grace)
            options.emit({ type: 'interim', text: interim })
          }
          const final = content?.inputTranscription
          if (final) {
            const text = final.text?.trim()
            if (text) options.emit({ type: 'final', text })
            // Each final covers one speech segment, ended by a pause.
            options.emit({ type: 'turn-end' })
            if (socket.closing) closeSoon(socket)
          }
        },
      })

      return {
        send: (audio) => {
          sentAudio = true
          live.sendJson({
            realtimeInput: { audio: { data: bytesToBase64(audio), mimeType } },
          })
        },
        close: async () => {
          const done = live.finish(
            { realtimeInput: { audioStreamEnd: true } },
            sentAudio ? 5000 : 0,
          )
          // The last final can be in already. Then no final comes.
          if (sentAudio) closeSoon(live)
          await done
          clearTimeout(grace)
        },
      }
    },
  }
}
