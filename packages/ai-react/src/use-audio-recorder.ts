import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  /** Latest recording (transformed if `onComplete` provided), or null. */
  recording: TOutput | null
  /** True while actively capturing audio. */
  isRecording: boolean
  /** Whether the browser supports recording (getUserMedia + MediaRecorder). */
  isSupported: boolean
  /** Acquire the mic and begin recording. */
  start: () => Promise<void>
  /** Stop and resolve with the completed recording (transformed if `onComplete` provided). */
  stop: () => Promise<TOutput>
  /** Discard the in-progress recording and release the mic. */
  cancel: () => void
}

/**
 * React hook for recording an audio message. The resolved
 * {@link AudioRecording} carries `.part` (an audio content part for
 * `useChat.sendMessage`) and `.base64` (for the generation hooks).
 *
 * Errors are delivered via `onError`. `start()` and `stop()` also reject on
 * failure (and `stop()` rejects with `Recording cancelled` if the component
 * unmounts while a stop is in flight) — handle one channel, not both.
 *
 * @example
 * ```tsx
 * const { isRecording, start, stop, recording } = useAudioRecorder()
 * const { sendMessage } = useChat({ connection })
 * // ...
 * const rec = await stop()
 * sendMessage({ content: [rec.part] })
 * ```
 */
export function useAudioRecorder<
  TOnComplete extends (recording: AudioRecording) => unknown,
>(
  options: UseAudioRecorderOptions<TOnComplete>,
): UseAudioRecorderReturn<InferAudioRecordingOutput<TOnComplete>>
export function useAudioRecorder(
  options?: UseAudioRecorderOptions<undefined>,
): UseAudioRecorderReturn<AudioRecording>
export function useAudioRecorder(
  options: UseAudioRecorderOptions<(recording: AudioRecording) => unknown> = {},
): UseAudioRecorderReturn<unknown> {
  const [isRecording, setIsRecording] = useState(false)
  const [recording, setRecording] = useState<unknown>(null)
  // Read the freshest callbacks at fire time without recreating the recorder.
  const optionsRef = useRef(options)
  optionsRef.current = options

  const recorder = useMemo(
    () =>
      new AudioRecorder({
        ...(options.audio !== undefined && { audio: options.audio }),
        ...(options.mimeType !== undefined && { mimeType: options.mimeType }),
        onError: (err) => optionsRef.current.onError?.(err),
      }),
    // Recorder config (audio/mimeType) is captured once at mount, matching the
    // other hooks' create-once pattern.
    [],
  )

  useEffect(() => {
    const unsubscribe = recorder.subscribe((state) => {
      setIsRecording(state === 'recording')
    })
    return () => {
      unsubscribe()
      recorder.cancel()
    }
  }, [recorder])

  const start = useCallback(() => recorder.start(), [recorder])
  const stop = useCallback(async () => {
    const recording = await recorder.stop()
    const transformed = await optionsRef.current.onComplete?.(recording)
    const output = transformed ?? recording
    setRecording(() => output)
    return output
  }, [recorder])
  const cancel = useCallback(() => recorder.cancel(), [recorder])

  return {
    recording,
    isRecording,
    // recording is client-only; if SSR'd, gate UI on a mounted flag.
    isSupported: AudioRecorder.isSupported(),
    start,
    stop,
    cancel,
  }
}
