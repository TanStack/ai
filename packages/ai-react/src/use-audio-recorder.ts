import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioRecorder } from '@tanstack/ai-client'
import type { AudioRecorderOptions, AudioRecording } from '@tanstack/ai-client'

export interface UseAudioRecorderReturn {
  /** True while actively capturing audio. */
  isRecording: boolean
  /** Whether the browser supports recording (getUserMedia + MediaRecorder). */
  isSupported: boolean
  /** Acquire the mic and begin recording. */
  start: () => Promise<void>
  /** Stop and resolve with the completed recording. */
  stop: () => Promise<AudioRecording>
  /** Discard the in-progress recording and release the mic. */
  cancel: () => void
}

/**
 * React hook for recording an audio message. The resolved
 * {@link AudioRecording} carries `.part` (an audio content part for
 * `useChat.sendMessage`) and `.base64` (for the generation hooks).
 *
 * @example
 * ```tsx
 * const { isRecording, start, stop } = useAudioRecorder()
 * const { sendMessage } = useChat({ connection })
 * // ...
 * const rec = await stop()
 * sendMessage({ content: [rec.part] })
 * ```
 */
export function useAudioRecorder(
  options: AudioRecorderOptions = {},
): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false)
  // Read the freshest callbacks at fire time without recreating the recorder.
  const optionsRef = useRef(options)
  optionsRef.current = options

  const recorder = useMemo(
    () =>
      new AudioRecorder({
        ...options,
        onComplete: (rec) => optionsRef.current.onComplete?.(rec),
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
  const stop = useCallback(() => recorder.stop(), [recorder])
  const cancel = useCallback(() => recorder.cancel(), [recorder])

  return {
    isRecording,
    // ponytail: recording is client-only; if SSR'd, gate UI on a mounted flag.
    isSupported: AudioRecorder.isSupported(),
    start,
    stop,
    cancel,
  }
}
