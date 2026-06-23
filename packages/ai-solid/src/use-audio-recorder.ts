import { createSignal, onCleanup } from 'solid-js'
import { AudioRecorder } from '@tanstack/ai-client'
import type {
  AudioRecorderOptions,
  AudioRecording,
} from '@tanstack/ai-client'

export interface UseAudioRecorderReturn {
  /** Solid accessor: true while actively capturing audio. */
  isRecording: () => boolean
  /** Whether the browser supports recording. */
  isSupported: boolean
  start: () => Promise<void>
  stop: () => Promise<AudioRecording>
  cancel: () => void
}

/**
 * Solid hook for recording an audio message. The resolved recording carries
 * `.part` (for `useChat.sendMessage`) and `.base64` (for generation hooks).
 */
export function useAudioRecorder(
  options: AudioRecorderOptions = {},
): UseAudioRecorderReturn {
  const recorder = new AudioRecorder(options)
  const [isRecording, setIsRecording] = createSignal(false)

  const unsubscribe = recorder.subscribe((state) => {
    setIsRecording(state === 'recording')
  })

  onCleanup(() => {
    unsubscribe()
    recorder.cancel()
  })

  return {
    isRecording,
    isSupported: AudioRecorder.isSupported(),
    start: () => recorder.start(),
    stop: () => recorder.stop(),
    cancel: () => recorder.cancel(),
  }
}
