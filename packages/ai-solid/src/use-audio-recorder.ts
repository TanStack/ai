import { createSignal, onCleanup } from 'solid-js'
import { AudioRecorder } from '@tanstack/ai-client'
import type {
  AudioRecorderOptions,
  AudioRecording,
  InferAudioRecordingOutput,
} from '@tanstack/ai-client'

export type UseAudioRecorderOptions<TOnComplete> = AudioRecorderOptions & {
  /**
   * Optional transform applied to the recording when `stop()` resolves. Its
   * (awaited) return value becomes `recording` and the resolved value of
   * `stop()`. Return nothing to keep the raw `AudioRecording`.
   */
  onComplete?: TOnComplete
}

export interface UseAudioRecorderReturn<TOutput> {
  /** Solid accessor: latest recording (transformed if `onComplete` provided), or null. */
  recording: () => TOutput | null
  /** Solid accessor: true while actively capturing audio. */
  isRecording: () => boolean
  /** Whether the browser supports recording. */
  isSupported: boolean
  start: () => Promise<void>
  /** Stop and resolve with the completed recording (transformed if `onComplete` provided). */
  stop: () => Promise<TOutput>
  /** Discard the in-progress recording and release the mic. */
  cancel: () => void
}

/**
 * Solid hook for recording an audio message. The resolved recording carries
 * `.part` (for `useChat.sendMessage`) and `.base64` (for generation hooks).
 *
 * Errors are delivered via `onError`. `start()` and `stop()` also reject on
 * failure (and `stop()` rejects with `Recording cancelled` if `cancel()` runs
 * while a stop is in flight, e.g. on unmount) — handle one channel, not both.
 */
// The transforming overload requires `onComplete`. Without that constraint an
// options object carrying only unrelated keys (`useAudioRecorder({ onError })`)
// still matches it, `TOnComplete` infers as `unknown`, and `recording`/`stop()`
// collapse to `unknown` — so passing any option would silently cost you the
// `AudioRecording` type. Requiring it here sends those calls to the second
// overload instead (issue #1001).
export function useAudioRecorder<
  TOnComplete extends (recording: AudioRecording) => unknown,
>(
  options: UseAudioRecorderOptions<TOnComplete> & { onComplete: TOnComplete },
): UseAudioRecorderReturn<InferAudioRecordingOutput<TOnComplete>>
export function useAudioRecorder(
  options?: UseAudioRecorderOptions<undefined>,
): UseAudioRecorderReturn<AudioRecording>
export function useAudioRecorder(
  options: UseAudioRecorderOptions<(recording: AudioRecording) => unknown> = {},
): UseAudioRecorderReturn<unknown> {
  const recorder = new AudioRecorder({
    ...(options.audio !== undefined && { audio: options.audio }),
    ...(options.mimeType !== undefined && { mimeType: options.mimeType }),
    ...(options.onError !== undefined && { onError: options.onError }),
  })
  const [isRecording, setIsRecording] = createSignal(false)
  const [recording, setRecording] = createSignal<unknown>(null)

  const unsubscribe = recorder.subscribe((state) => {
    setIsRecording(state === 'recording')
  })

  onCleanup(() => {
    unsubscribe()
    recorder.cancel()
  })

  const stop = async (): Promise<unknown> => {
    const rawRecording = await recorder.stop()
    const transformed = await options.onComplete?.(rawRecording)
    // Only `undefined` (returning nothing) keeps the raw recording; a returned
    // null is a real value, matching the inferred output type.
    const output = transformed === undefined ? rawRecording : transformed
    // Store via updater so a function-valued transform result isn't invoked.
    setRecording(() => output)
    return output
  }

  return {
    recording,
    isRecording,
    isSupported: AudioRecorder.isSupported(),
    start: () => recorder.start(),
    stop,
    cancel: () => recorder.cancel(),
  }
}
