/**
 * Audio encodings a live transcription session can take.
 * - `linear16`: 16-bit signed little-endian PCM
 * - `mulaw`: G.711 μ-law (Twilio, Telnyx, Plivo, Vonage in North America)
 * - `alaw`: G.711 A-law (most carriers outside North America)
 */
export type LiveAudioEncoding = 'linear16' | 'mulaw' | 'alaw'

/** The format of the raw audio chunks you send to a session. */
export interface LiveAudioFormat {
  encoding: LiveAudioEncoding
  /** Samples per second, for example 8000 for a phone call. */
  sampleRate: number
  /** Interleaved channels. Defaults to 1. */
  channels?: number
}

/** One audio input an adapter accepts. */
export interface LiveAudioInput {
  encoding: LiveAudioEncoding
  /** Sample rates the provider accepts. Omit when any rate works. */
  sampleRates?: ReadonlyArray<number>
}

/** An event from a live transcription session. */
export type LiveTranscriptionEvent =
  /** Text that can still change. Use it for live captions and barge-in. */
  | { type: 'interim'; text: string }
  /** Stable text for one segment. It does not change again. */
  | { type: 'final'; text: string }
  /** The provider thinks the speaker finished their turn. */
  | { type: 'turn-end' }
  /** A provider or connection error. The session can end after it. */
  | { type: 'error'; error: Error }

/** What the activity gives an adapter when it opens a connection. */
export interface LiveTranscriptionConnectOptions<
  TProviderOptions extends object = Record<string, unknown>,
> {
  model: string
  /** The audio format the adapter receives. It is always one of the adapter's `audioInputs`. */
  audio: LiveAudioFormat
  /** ISO-639-1 language code, for example `en`. */
  language?: string
  modelOptions?: TProviderOptions
  /** Push an event to the session. */
  emit: (event: LiveTranscriptionEvent) => void
  /** Call once, when the provider connection is gone. It ends the session. */
  end: () => void
  abortSignal?: AbortSignal
}

/** An open provider connection. */
export interface LiveTranscriptionConnection {
  /** Send one chunk of audio, already in the format given to `connect`. */
  send: (audio: Uint8Array) => void
  /** Flush the last text, then close the connection. */
  close: () => Promise<void>
}

/**
 * Adapter contract for live speech-to-text.
 *
 * Generic parameters:
 * - TModel: The model name (for example `nova-3`)
 * - TProviderOptions: Provider-specific options
 */
export interface LiveTranscriptionAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  readonly kind: 'liveTranscription'
  readonly name: string
  readonly model: TModel
  /**
   * The audio this provider accepts. When the session input is not in this
   * list, the activity converts it to `linear16`.
   */
  readonly audioInputs: ReadonlyArray<LiveAudioInput>

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  '~types': {
    providerOptions: TProviderOptions
  }

  /** Open a connection to the provider. Resolve when it can take audio. */
  connect: (
    options: LiveTranscriptionConnectOptions<TProviderOptions>,
  ) => Promise<LiveTranscriptionConnection>
}

/** A LiveTranscriptionAdapter with any type parameters. */
export type AnyLiveTranscriptionAdapter = LiveTranscriptionAdapter<any, any>
