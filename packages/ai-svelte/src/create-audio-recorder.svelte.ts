import { AudioRecorder } from '@tanstack/ai-client'
import type { AudioRecorderOptions, AudioRecording } from '@tanstack/ai-client'

export interface CreateAudioRecorderReturn {
  /** Reactive: true while actively capturing audio. */
  readonly isRecording: boolean
  /** Whether the browser supports recording. */
  readonly isSupported: boolean
  start: () => Promise<void>
  stop: () => Promise<AudioRecording>
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
 */
export function createAudioRecorder(
  options: AudioRecorderOptions = {},
): CreateAudioRecorderReturn {
  const recorder = new AudioRecorder(options)
  let isRecording = $state(false)

  recorder.subscribe((state) => {
    isRecording = state === 'recording'
  })

  return {
    get isRecording() {
      return isRecording
    },
    get isSupported() {
      return AudioRecorder.isSupported()
    },
    start: () => recorder.start(),
    stop: () => recorder.stop(),
    cancel: () => recorder.cancel(),
  }
}
