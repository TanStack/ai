import { AudioRecorder } from '@tanstack/ai-client'
import type {
  AudioRecorderOptions,
  AudioRecording,
  InferAudioRecordingOutput,
} from '@tanstack/ai-client'
import type { Handle } from 'remix/ui'

export type CreateAudioRecorderOptions<TOnComplete> = AudioRecorderOptions & {
  /**
   * Optional transform applied to the recording when `stop()` resolves. Its
   * (awaited) return value becomes `recording` and the resolved value of
   * `stop()`. Return nothing to keep the raw `AudioRecording`.
   */
  onComplete?: TOnComplete
}

/**
 * Remix factory for recording an audio message. Call in setup with Handle.
 * The resolved {@link AudioRecording} carries `.part` (an audio content part
 * for `createChat.sendMessage`) and `.base64` (for generation helpers).
 *
 * Recorder state changes call `handle.update()`. Disconnect aborts
 * `handle.signal`, which unsubscribes and cancels the recorder.
 *
 * Errors are delivered via `onError`. `start()` and `stop()` also reject on
 * failure (and `stop()` rejects with `Recording cancelled` if the component
 * disconnects while a stop is in flight) — handle one channel, not both.
 *
 * @param handle Remix component handle from setup. Re-renders on recorder
 *   state changes and cancels on disconnect.
 * @param options Recorder options plus an optional `onComplete` transform.
 *
 * @example
 * ```tsx
 * function Voice(handle: Handle) {
 *   const recorder = createAudioRecorder(handle)
 *   return () => (
 *     <button onClick={() => void recorder.start()}>
 *       {recorder.isRecording ? 'Recording' : 'Record'}
 *     </button>
 *   )
 * }
 * ```
 */
// TOnComplete defaults to undefined so `{ onError }` does not infer
// `unknown` and collapse `recording` / `stop()` (issue #1001).
export function createAudioRecorder<
  TOnComplete extends ((recording: AudioRecording) => unknown) | undefined =
    undefined,
>(handle: Handle, options: CreateAudioRecorderOptions<TOnComplete> = {}) {
  const recorder = new AudioRecorder({
    ...(options.audio !== undefined && { audio: options.audio }),
    ...(options.mimeType !== undefined && { mimeType: options.mimeType }),
    onError: (error) => options.onError?.(error),
  })

  let isRecording = false
  let recording: InferAudioRecordingOutput<TOnComplete> | null = null

  const unsubscribe = recorder.subscribe((state) => {
    isRecording = state === 'recording'
    void handle.update()
  })

  const teardown = () => {
    unsubscribe()
    recorder.cancel()
  }
  handle.signal.addEventListener('abort', teardown, { once: true })
  if (handle.signal.aborted) {
    teardown()
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
    async stop() {
      const rawRecording = await recorder.stop()
      const transformed = await options.onComplete?.(rawRecording)
      // Only `undefined` (returning nothing) keeps the raw recording; a
      // returned null is a real value, matching the inferred output type.
      const output = (
        transformed === undefined ? rawRecording : transformed
      ) as InferAudioRecordingOutput<TOnComplete>
      recording = output
      void handle.update()
      return output
    },
    cancel: () => recorder.cancel(),
  }
}
