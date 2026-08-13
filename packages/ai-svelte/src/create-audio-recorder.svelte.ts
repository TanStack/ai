import { AudioRecorder } from '@tanstack/ai-client'
import type {
  AudioRecorderOptions,
  AudioRecording,
  InferAudioRecordingOutput,
} from '@tanstack/ai-client'

export type CreateAudioRecorderOptions<TOnComplete> = AudioRecorderOptions & {
  /**
   * Optional transform applied to the recording when `stop()` resolves. Its
   * (awaited) return value becomes `recording` and the resolved value of
   * `stop()`. Return nothing to keep the raw `AudioRecording`.
   */
  onComplete?: TOnComplete
}

export interface CreateAudioRecorderReturn<TOutput> {
  /** Reactive: latest recording (transformed if `onComplete` provided), or null. */
  readonly recording: TOutput | null
  /** Reactive: true while actively capturing audio. */
  readonly isRecording: boolean
  /** Whether the browser supports recording. */
  readonly isSupported: boolean
  start: () => Promise<void>
  /** Stop and resolve with the completed recording (transformed if `onComplete` provided). */
  stop: () => Promise<TOutput>
  /**
   * Discard the in-progress recording and release the mic. Svelte 5 runes
   * can't register automatic teardown here (matching `createChat`), so call
   * this from your component's cleanup if a recording may still be active.
   */
  cancel: () => void
}

/**
 * Svelte 5 factory for recording an audio message. The resolved recording
 * carries `.part` (for `createChat.sendMessage`) and `.base64` (for the
 * generation factories).
 *
 * Errors are delivered via `onError`. `start()` and `stop()` also reject on
 * failure (and `stop()` rejects with `Recording cancelled` if `cancel()` runs
 * while a stop is in flight) — handle one channel, not both.
 */
export function createAudioRecorder<
  TOnComplete extends (recording: AudioRecording) => unknown,
>(
  options: CreateAudioRecorderOptions<TOnComplete>,
): CreateAudioRecorderReturn<InferAudioRecordingOutput<TOnComplete>>
export function createAudioRecorder(
  options?: CreateAudioRecorderOptions<undefined>,
): CreateAudioRecorderReturn<AudioRecording>
export function createAudioRecorder(
  options: CreateAudioRecorderOptions<
    (recording: AudioRecording) => unknown
  > = {},
): CreateAudioRecorderReturn<unknown> {
  const recorder = new AudioRecorder({
    ...(options.audio !== undefined && { audio: options.audio }),
    ...(options.mimeType !== undefined && { mimeType: options.mimeType }),
    ...(options.onError !== undefined && { onError: options.onError }),
  })
  let isRecording = $state(false)
  let recording = $state<unknown>(null)

  recorder.subscribe((state) => {
    isRecording = state === 'recording'
  })

  const stop = async (): Promise<unknown> => {
    const rawRecording = await recorder.stop()
    const transformed = await options.onComplete?.(rawRecording)
    // Only `undefined` (returning nothing) keeps the raw recording; a returned
    // null is a real value, matching the inferred output type.
    const output = transformed === undefined ? rawRecording : transformed
    recording = output
    return output
  }

  return {
    get recording() {
      return recording
    },
    get isRecording() {
      return isRecording
    },
    get isSupported() {
      return AudioRecorder.isSupported()
    },
    start: () => recorder.start(),
    stop,
    cancel: () => recorder.cancel(),
  }
}
