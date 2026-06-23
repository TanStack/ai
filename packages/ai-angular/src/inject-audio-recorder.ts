import {
  DestroyRef,
  assertInInjectionContext,
  inject,
  signal,
} from '@angular/core'
import { AudioRecorder } from '@tanstack/ai-client'
import type { Signal } from '@angular/core'
import type { AudioRecorderOptions, AudioRecording } from '@tanstack/ai-client'

export interface InjectAudioRecorderResult {
  /** Reactive: true while actively capturing audio. */
  isRecording: Signal<boolean>
  /** Whether the browser supports recording. */
  isSupported: boolean
  start: () => Promise<void>
  stop: () => Promise<AudioRecording>
  cancel: () => void
}

/**
 * Angular injectable for recording an audio message. The resolved recording
 * carries `.part` (for `injectChat`'s `sendMessage`) and `.base64` (for the
 * generation injectables). Must be called in an injection context.
 */
export function injectAudioRecorder(
  options: AudioRecorderOptions = {},
): InjectAudioRecorderResult {
  assertInInjectionContext(injectAudioRecorder)
  const destroyRef = inject(DestroyRef)
  const recorder = new AudioRecorder(options)
  const isRecording = signal(false)

  const unsubscribe = recorder.subscribe((state) => {
    isRecording.set(state === 'recording')
  })

  destroyRef.onDestroy(() => {
    unsubscribe()
    recorder.cancel()
  })

  return {
    isRecording: isRecording.asReadonly(),
    isSupported: AudioRecorder.isSupported(),
    start: () => recorder.start(),
    stop: () => recorder.stop(),
    cancel: () => recorder.cancel(),
  }
}
