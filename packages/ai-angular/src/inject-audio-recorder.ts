import {
  DestroyRef,
  assertInInjectionContext,
  inject,
  signal,
} from '@angular/core'
import { AudioRecorder } from '@tanstack/ai-client'
import type { Signal } from '@angular/core'
import type {
  AudioRecorderOptions,
  AudioRecording,
  InferAudioRecordingOutput,
} from '@tanstack/ai-client'

export interface InjectAudioRecorderResult<TOutput> {
  /** Reactive: latest recording (transformed if `onComplete` provided), or null. */
  content: Signal<TOutput | null>
  /** Reactive: true while actively capturing audio. */
  isRecording: Signal<boolean>
  /** Whether the browser supports recording. */
  isSupported: boolean
  start: () => Promise<void>
  stop: () => Promise<TOutput>
  cancel: () => void
}

/**
 * Angular injectable for recording an audio message. The resolved recording
 * carries `.part` (for `injectChat`'s `sendMessage`) and `.base64` (for the
 * generation injectables). Must be called in an injection context.
 */
export function injectAudioRecorder<
  TOnComplete extends ((recording: AudioRecording) => any) | undefined =
    undefined,
>(
  options: AudioRecorderOptions & { onComplete?: TOnComplete } = {},
): InjectAudioRecorderResult<InferAudioRecordingOutput<TOnComplete>> {
  assertInInjectionContext(injectAudioRecorder)
  type TOutput = InferAudioRecordingOutput<TOnComplete>
  const destroyRef = inject(DestroyRef)
  const recorder = new AudioRecorder({
    ...(options.audio !== undefined && { audio: options.audio }),
    ...(options.mimeType !== undefined && { mimeType: options.mimeType }),
    ...(options.onError !== undefined && { onError: options.onError }),
  })
  const isRecording = signal(false)
  const content = signal<TOutput | null>(null)

  const unsubscribe = recorder.subscribe((state) => {
    isRecording.set(state === 'recording')
  })
  destroyRef.onDestroy(() => {
    unsubscribe()
    recorder.cancel()
  })

  const stop = async (): Promise<TOutput> => {
    const recording = await recorder.stop()
    const transformed = await options.onComplete?.(recording)
    const output = (transformed ?? recording) as TOutput
    content.set(output)
    return output
  }

  return {
    content: content.asReadonly(),
    isRecording: isRecording.asReadonly(),
    isSupported: AudioRecorder.isSupported(),
    start: () => recorder.start(),
    stop,
    cancel: () => recorder.cancel(),
  }
}
