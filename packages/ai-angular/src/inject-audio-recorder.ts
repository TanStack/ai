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

export type InjectAudioRecorderOptions<TOnComplete> = AudioRecorderOptions & {
  onComplete?: TOnComplete
}

export interface InjectAudioRecorderResult<TOutput> {
  /** Reactive: latest recording (transformed if `onComplete` provided), or null. */
  recording: Signal<TOutput | null>
  /** Reactive: true while actively capturing audio. */
  isRecording: Signal<boolean>
  /** Whether the browser supports recording. */
  isSupported: boolean
  start: () => Promise<void>
  /** Stop and resolve with the completed recording (transformed if `onComplete` provided). */
  stop: () => Promise<TOutput>
  /** Discard the in-progress recording and release the mic. */
  cancel: () => void
}

export function injectAudioRecorder<
  TOnComplete extends (recording: AudioRecording) => unknown,
>(
  options: InjectAudioRecorderOptions<TOnComplete> & {
    onComplete: TOnComplete
  },
): InjectAudioRecorderResult<InferAudioRecordingOutput<TOnComplete>>
export function injectAudioRecorder(
  options?: InjectAudioRecorderOptions<undefined>,
): InjectAudioRecorderResult<AudioRecording>
export function injectAudioRecorder(
  options: InjectAudioRecorderOptions<
    (recording: AudioRecording) => unknown
  > = {},
): InjectAudioRecorderResult<unknown> {
  assertInInjectionContext(injectAudioRecorder)
  const destroyRef = inject(DestroyRef)
  const recorder = new AudioRecorder({
    ...(options.audio !== undefined && { audio: options.audio }),
    ...(options.mimeType !== undefined && { mimeType: options.mimeType }),
    ...(options.onError !== undefined && { onError: options.onError }),
  })
  const isRecording = signal(false)
  const recording = signal<unknown>(null)

  const unsubscribe = recorder.subscribe((state) => {
    isRecording.set(state === 'recording')
  })
  destroyRef.onDestroy(() => {
    unsubscribe()
    recorder.cancel()
  })

  const stop = async (): Promise<unknown> => {
    const rawRecording = await recorder.stop()
    const transformed = await options.onComplete?.(rawRecording)
    // Only `undefined` (returning nothing) keeps the raw recording; a returned
    // null is a real value, matching the inferred output type.
    const output = transformed === undefined ? rawRecording : transformed
    recording.set(output)
    return output
  }

  return {
    recording: recording.asReadonly(),
    isRecording: isRecording.asReadonly(),
    isSupported: AudioRecorder.isSupported(),
    start: () => recorder.start(),
    stop,
    cancel: () => recorder.cancel(),
  }
}
