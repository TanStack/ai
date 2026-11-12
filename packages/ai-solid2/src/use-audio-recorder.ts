import { createSignal, onCleanup, onSettled, untrack } from 'solid-js'
import { AudioRecorder } from '@tanstack/ai-client'
import type { AudioRecorderOptions, AudioRecording } from '@tanstack/ai-client'

// A conditional transform can keep the raw recording as well as return a value.
type InferAudioRecordingOutput<TFn> = TFn extends (
  recording: AudioRecording,
) => infer R
  ?
      | Exclude<Awaited<R>, void | undefined>
      | (undefined extends Awaited<R> ? AudioRecording : never)
  : AudioRecording

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
 * Media and transform errors are delivered via `onError` while mounted.
 * `start()` and `stop()` also reject on failure. Cancelling media finalization
 * rejects `stop()` with `Recording cancelled`. An already-running transform
 * still settles its caller after cleanup, but no longer updates `recording`
 * or calls `onError`.
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
  let disposed = false
  const recorder = untrack(
    () =>
      new AudioRecorder({
        ...(options.audio !== undefined && { audio: options.audio }),
        ...(options.mimeType !== undefined && { mimeType: options.mimeType }),
        onError: (error) => {
          if (!disposed) options.onError?.(error)
        },
      }),
  )
  const [isRecording, setIsRecording] = createSignal(
    recorder.getSnapshot() === 'recording',
  )
  const [recording, setRecording] = createSignal<unknown>(null)
  let latestStop = 0

  onSettled(() => {
    const unsubscribe = recorder.subscribe((state) => {
      setIsRecording(state === 'recording')
    })
    setIsRecording(recorder.getSnapshot() === 'recording')
    return unsubscribe
  })

  onCleanup(() => {
    disposed = true
    recorder.cancel()
  })

  const stop = async (): Promise<unknown> => {
    // Rejected duplicate stops must not invalidate the active recording's stop.
    const stopId =
      recorder.getSnapshot() === 'recording' ? ++latestStop : latestStop
    const rawRecording = await recorder.stop()
    if (disposed) throw new Error('Recording cancelled')
    let transformed: unknown
    try {
      transformed = await options.onComplete?.(rawRecording)
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to transform recording')
      try {
        if (!disposed) options.onError?.(error)
      } catch {
        // Keep the transform failure independent of errors in the callback.
      }
      throw error
    }
    // Only `undefined` (returning nothing) keeps the raw recording; a returned
    // null is a real value, matching the inferred output type.
    const output = transformed === undefined ? rawRecording : transformed
    // Store via updater so a function-valued transform result isn't invoked.
    if (!disposed && stopId === latestStop) setRecording(() => output)
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
