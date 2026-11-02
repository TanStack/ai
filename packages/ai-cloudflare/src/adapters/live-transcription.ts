import { deepgramLiveTranscription } from '@tanstack/ai-deepgram'
import type { DeepgramLiveTranscriptionProviderOptions } from '@tanstack/ai-deepgram'
import type { LiveTranscriptionAdapter } from '@tanstack/ai'
import type { Ai } from '@cloudflare/workers-types'

/** Workers AI models that stream speech-to-text over a WebSocket. */
export const CLOUDFLARE_LIVE_TRANSCRIPTION_MODELS = [
  '@cf/deepgram/nova-3',
  '@cf/deepgram/flux',
] as const

export type CloudflareLiveTranscriptionModel =
  (typeof CLOUDFLARE_LIVE_TRANSCRIPTION_MODELS)[number]

export interface CloudflareLiveTranscriptionConfig {
  /** The Workers AI binding (`env.AI`). */
  binding: Ai
}

/**
 * Workers AI live speech-to-text adapter for `transcriptionSession()`. Runs
 * Deepgram Nova-3 or Flux through the `env.AI` binding inside a Worker.
 * Nova-3 takes linear16 and μ-law. Flux takes linear16 and detects turns.
 *
 * @example
 * ```ts
 * const session = await transcriptionSession({
 *   adapter: cloudflareLiveTranscription('@cf/deepgram/nova-3', { binding: env.AI }),
 *   audio: { encoding: 'mulaw', sampleRate: 8000 },
 * })
 * ```
 */
export function cloudflareLiveTranscription<
  TModel extends CloudflareLiveTranscriptionModel,
>(
  model: TModel,
  config: CloudflareLiveTranscriptionConfig,
): LiveTranscriptionAdapter<TModel, DeepgramLiveTranscriptionProviderOptions> {
  const flux = model === '@cf/deepgram/flux'
  const deepgram = deepgramLiveTranscription(
    flux ? 'flux-general-en' : 'nova-3',
    {
      openSocket: async (query) => {
        // The binding's typed inputs are for the HTTP path; WebSocket runs
        // take the Deepgram query parameters as strings.
        const run = config.binding.run.bind(config.binding) as (
          model: string,
          inputs: Record<string, string>,
          options: { websocket: true },
        ) => Promise<{
          webSocket: (WebSocket & { accept: () => void }) | null
        }>
        query.delete('model')
        // ponytail: one keyterm only, the binding takes a flat object.
        const res = await run(model, Object.fromEntries(query), {
          websocket: true,
        })
        if (!res.webSocket) {
          throw new Error(`Workers AI did not open a WebSocket for ${model}.`)
        }
        res.webSocket.accept()
        return res.webSocket
      },
    },
  )
  return {
    ...deepgram,
    name: 'cloudflare',
    model,
    audioInputs: flux
      ? [
          {
            encoding: 'linear16',
            sampleRates: [8000, 16000, 24000, 44100, 48000],
          },
        ]
      : [{ encoding: 'linear16' }, { encoding: 'mulaw' }],
  }
}
