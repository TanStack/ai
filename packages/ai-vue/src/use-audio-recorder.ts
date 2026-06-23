import { onScopeDispose, readonly, ref } from 'vue'
import { AudioRecorder } from '@tanstack/ai-client'
import type { Ref } from 'vue'
import type {
  AudioRecorderOptions,
  AudioRecording,
} from '@tanstack/ai-client'

export interface UseAudioRecorderReturn {
  /** Readonly ref: true while actively capturing audio. */
  isRecording: Readonly<Ref<boolean>>
  /** Whether the browser supports recording. */
  isSupported: boolean
  start: () => Promise<void>
  stop: () => Promise<AudioRecording>
  cancel: () => void
}

/**
 * Vue composable for recording an audio message. The resolved recording
 * carries `.part` (for `useChat.sendMessage`) and `.base64` (for generation
 * hooks).
 */
export function useAudioRecorder(
  options: AudioRecorderOptions = {},
): UseAudioRecorderReturn {
  const recorder = new AudioRecorder(options)
  const isRecording = ref(false)

  const unsubscribe = recorder.subscribe((state) => {
    isRecording.value = state === 'recording'
  })

  onScopeDispose(() => {
    unsubscribe()
    recorder.cancel()
  })

  return {
    isRecording: readonly(isRecording),
    isSupported: AudioRecorder.isSupported(),
    start: () => recorder.start(),
    stop: () => recorder.stop(),
    cancel: () => recorder.cancel(),
  }
}
