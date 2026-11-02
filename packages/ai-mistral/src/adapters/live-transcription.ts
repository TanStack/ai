import { bytesToBase64, openLiveSocket } from '@tanstack/ai/adapter-internals'
import { getMistralApiKeyFromEnv } from '../utils/client'
import type { WebSocketConstructor } from '@tanstack/ai/adapter-internals'
import type { LiveTranscriptionAdapter } from '@tanstack/ai'

/** Voxtral models for realtime speech-to-text. */
export const MISTRAL_LIVE_TRANSCRIPTION_MODELS = [
  'voxtral-mini-transcribe-realtime-2602',
] as const

export type MistralLiveTranscriptionModel =
  (typeof MISTRAL_LIVE_TRANSCRIPTION_MODELS)[number]

export interface MistralLiveTranscriptionProviderOptions {
  /** How long the model waits for more audio before it writes text. */
  targetStreamingDelayMs?: number
}

export interface MistralLiveTranscriptionConfig {
  /** Defaults to `MISTRAL_API_KEY`. */
  apiKey?: string
  /** Defaults to `https://api.mistral.ai`. */
  baseURL?: string
  /** Used to mint the client token. Defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Defaults to the global `WebSocket`. */
  WebSocket?: WebSocketConstructor
}

interface VoxtralMessage {
  type?: string
  text?: string
  error?: { message?: unknown }
}

const ENCODINGS = {
  linear16: 'pcm_s16le',
  mulaw: 'pcm_mulaw',
  alaw: 'pcm_alaw',
} as const

/**
 * Mistral Voxtral realtime adapter for `transcriptionSession()`.
 * Takes linear16 PCM at 8 to 48 kHz, and G.711 μ-law and A-law at 8 kHz.
 * Voxtral sends no turn-end events.
 *
 * @example
 * ```ts
 * const session = await transcriptionSession({
 *   adapter: mistralLiveTranscription('voxtral-mini-transcribe-realtime-2602'),
 *   audio: { encoding: 'mulaw', sampleRate: 8000 },
 * })
 * ```
 */
export function mistralLiveTranscription<
  TModel extends MistralLiveTranscriptionModel,
>(
  model: TModel,
  config: MistralLiveTranscriptionConfig = {},
): LiveTranscriptionAdapter<TModel, MistralLiveTranscriptionProviderOptions> {
  return {
    kind: 'liveTranscription',
    name: 'mistral',
    model,
    audioInputs: [
      {
        encoding: 'linear16',
        sampleRates: [8000, 16000, 22050, 24000, 44100, 48000],
      },
      { encoding: 'mulaw', sampleRates: [8000] },
      { encoding: 'alaw', sampleRates: [8000] },
    ],
    '~types': {} as never,
    connect: async (options) => {
      const base = config.baseURL ?? 'https://api.mistral.ai'
      const apiKey = config.apiKey ?? getMistralApiKeyFromEnv()
      // A WebSocket cannot send headers, so mint a short-lived client token.
      const res = await (config.fetch ?? fetch)(`${base}/v1/client/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ purpose: 'realtime', model: options.model }),
        signal: options.abortSignal,
      })
      if (!res.ok) {
        throw new Error(
          `Mistral client token request failed (${res.status}): ${await res.text()}`,
        )
      }
      const { client_secret } = (await res.json()) as {
        client_secret: { value: string }
      }

      const { encoding, sampleRate } = options.audio
      const delay = options.modelOptions?.targetStreamingDelayMs
      // Deltas since the last segment.
      let pending = ''
      const live = await openLiveSocket({
        url: `${base.replace(/^http/, 'ws')}/v1/audio/transcriptions/realtime?${new URLSearchParams({ model: options.model })}`,
        protocols: ['realtime', client_secret.value],
        WebSocket: config.WebSocket,
        connect: options,
        readyWhen: (m) => (m as VoxtralMessage).type === 'session.created',
        onMessage: (message, socket) => {
          const m = message as VoxtralMessage
          if (m.type === 'session.created') {
            socket.sendJson({
              type: 'session.update',
              session: {
                audio_format: {
                  encoding: ENCODINGS[encoding],
                  sample_rate: sampleRate,
                },
                ...(delay !== undefined && {
                  target_streaming_delay_ms: delay,
                }),
              },
            })
          } else if (m.type === 'transcription.text.delta') {
            pending += m.text ?? ''
            const text = pending.trim()
            if (text) options.emit({ type: 'interim', text })
          } else if (
            m.type === 'transcription.segment' ||
            m.type === 'transcription.done'
          ) {
            // `done` carries the whole transcript; only the unsegmented
            // tail is new.
            const text = (
              m.type === 'transcription.segment' ? (m.text ?? '') : pending
            ).trim()
            pending = ''
            if (text) options.emit({ type: 'final', text })
            if (m.type === 'transcription.done') socket.close()
          } else if (m.type === 'error') {
            const detail = m.error?.message
            options.emit({
              type: 'error',
              error: new Error(
                typeof detail === 'string'
                  ? detail
                  : JSON.stringify(detail ?? 'Mistral realtime error'),
              ),
            })
          }
        },
      })

      return {
        send: (audio) =>
          live.sendJson({
            type: 'input_audio.append',
            audio: bytesToBase64(audio),
          }),
        close: () => {
          live.sendJson({ type: 'input_audio.flush' })
          return live.finish({ type: 'input_audio.end' })
        },
      }
    },
  }
}
