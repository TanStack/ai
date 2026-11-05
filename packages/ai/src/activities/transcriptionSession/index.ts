/**
 * Live transcription session activity.
 *
 * Opens a provider connection that takes raw audio chunks as they arrive (a
 * phone call, an SFU track, a browser WebSocket) and yields text events while
 * the speaker talks. Runs on the server: Node, Bun, Workers, Durable Objects.
 */

import { base64ToUint8Array } from '@tanstack/ai-utils'
import { createAudioConverter, pickAudioFormat } from './audio'
import type {
  LiveAudioFormat,
  LiveTranscriptionAdapter,
  LiveTranscriptionEvent,
} from './adapter'

/** The adapter kind this activity handles */
export const kind = 'liveTranscription' as const

/** Extract provider options from a LiveTranscriptionAdapter via ~types. */
export type LiveTranscriptionProviderOptions<TAdapter> = TAdapter extends {
  '~types': { providerOptions: infer P extends object }
}
  ? P
  : object

export interface TranscriptionSessionOptions<
  TAdapter extends LiveTranscriptionAdapter<
    string,
    LiveTranscriptionProviderOptions<TAdapter>
  >,
> {
  /** The live transcription adapter to use (must be created with a model). */
  adapter: TAdapter & { kind: typeof kind }
  /** The format of the audio chunks you pass to `send()`. */
  audio: LiveAudioFormat
  /** The language of the audio in ISO-639-1 format (for example `en`). */
  language?: string
  /** Provider-specific options. */
  modelOptions?: LiveTranscriptionProviderOptions<TAdapter>
  /** Closes the session when it aborts. */
  abortSignal?: AbortSignal
}

/**
 * An open live transcription session. Iterate it for events. The iteration
 * ends after `close()` flushes the last text, or when the provider disconnects.
 */
export interface TranscriptionSession extends AsyncIterable<LiveTranscriptionEvent> {
  /**
   * Send a chunk of audio in the session's `audio` format. A string is read as
   * base64, which is what Twilio, Telnyx and Vonage send.
   */
  send: (audio: string | Uint8Array | ArrayBuffer) => void
  /** Flush the last text and close the session. */
  close: () => Promise<void>
}

/**
 * Open a live speech-to-text session.
 *
 * @example A Twilio Media Streams call
 * ```ts
 * import { transcriptionSession } from '@tanstack/ai'
 * import { deepgramLiveTranscription } from '@tanstack/ai-deepgram'
 *
 * const session = await transcriptionSession({
 *   adapter: deepgramLiveTranscription('nova-3'),
 *   audio: { encoding: 'mulaw', sampleRate: 8000 },
 * })
 * twilio.on('media', (m) => session.send(m.payload))
 * for await (const event of session) {
 *   if (event.type === 'final') console.log(event.text)
 * }
 * ```
 */
export async function transcriptionSession<
  TAdapter extends LiveTranscriptionAdapter<
    string,
    LiveTranscriptionProviderOptions<TAdapter>
  >,
>(
  options: TranscriptionSessionOptions<TAdapter>,
): Promise<TranscriptionSession> {
  const { adapter, audio, language, modelOptions, abortSignal } = options
  const target = pickAudioFormat(audio, adapter.audioInputs)
  const convert = createAudioConverter(audio, target)

  const queue: Array<LiveTranscriptionEvent> = []
  let done = false
  let wake: (() => void) | undefined
  const notify = () => {
    wake?.()
    wake = undefined
  }

  const connection = await adapter.connect({
    model: adapter.model,
    audio: target,
    language,
    modelOptions,
    abortSignal,
    emit: (event) => {
      if (done) return
      queue.push(event)
      notify()
    },
    end: () => {
      done = true
      notify()
    },
  })

  async function* events(): AsyncGenerator<LiveTranscriptionEvent> {
    try {
      while (true) {
        const next = queue.shift()
        if (next) yield next
        else if (done) return
        else await new Promise<void>((r) => (wake = r))
      }
    } finally {
      // The consumer stopped early (break or throw): close the connection.
      if (!done) await connection.close()
    }
  }

  return {
    send: (chunk) => {
      if (done) return
      const bytes =
        typeof chunk === 'string'
          ? base64ToUint8Array(chunk)
          : chunk instanceof Uint8Array
            ? chunk
            : new Uint8Array(chunk)
      const out = convert(bytes)
      if (out.length) connection.send(out)
    },
    close: () => connection.close(),
    [Symbol.asyncIterator]: events,
  }
}

export type {
  LiveAudioEncoding,
  LiveAudioFormat,
  LiveAudioInput,
  LiveTranscriptionAdapter,
  LiveTranscriptionConnectOptions,
  LiveTranscriptionConnection,
  LiveTranscriptionEvent,
  AnyLiveTranscriptionAdapter,
} from './adapter'
export { createAudioConverter, pickAudioFormat } from './audio'
