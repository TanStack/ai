import { onScopeDispose, readonly, ref, shallowRef } from 'vue'
import { AudioRecorder } from '@tanstack/ai-client'
import type { Ref } from 'vue'
import type {
  AudioRecorderOptions,
  AudioRecording,
  InferAudioRecordingOutput,
} from '@tanstack/ai-client'

export interface UseAudioRecorderReturn<TOutput> {
  /** Readonly ref: latest recording (transformed if `onComplete` provided), or null. */
  recording: Readonly<Ref<TOutput | null>>
  /** Readonly ref: true while actively capturing audio. */
  isRecording: Readonly<Ref<boolean>>
  /** Whether the browser supports recording. */
  isSupported: boolean
  start: () => Promise<void>
  stop: () => Promise<TOutput>
  cancel: () => void
}

/**
 * Vue composable for recording an audio message. The resolved recording
 * carries `.part` (for `useChat.sendMessage`) and `.base64` (for generation
 * hooks).
 */
export function useAudioRecorder<
  TOnComplete extends ((recording: AudioRecording) => any) | undefined =
    undefined,
>(
  options: AudioRecorderOptions & { onComplete?: TOnComplete } = {},
): UseAudioRecorderReturn<InferAudioRecordingOutput<TOnComplete>> {
  type TOutput = InferAudioRecordingOutput<TOnComplete>
  const recorder = new AudioRecorder({
    ...(options.audio !== undefined && { audio: options.audio }),
    ...(options.mimeType !== undefined && { mimeType: options.mimeType }),
    ...(options.onError !== undefined && { onError: options.onError }),
  })
  const isRecording = ref(false)
  const recording = shallowRef<TOutput | null>(null)

  const unsubscribe = recorder.subscribe((state) => {
    isRecording.value = state === 'recording'
  })

  onScopeDispose(() => {
    unsubscribe()
    recorder.cancel()
  })

  const stop = async (): Promise<TOutput> => {
    const rawRecording = await recorder.stop()
    const transformed = await options.onComplete?.(rawRecording)
    const output = (transformed ?? rawRecording) as TOutput
    recording.value = output
    return output
  }

  return {
    recording: readonly(recording),
    isRecording: readonly(isRecording),
    isSupported: AudioRecorder.isSupported(),
    start: () => recorder.start(),
    stop,
    cancel: () => recorder.cancel(),
  }
}
