import { createSignal, onCleanup } from 'solid-js'
import { AudioRecorder } from '@tanstack/ai-client'
import type {
  AudioRecorderOptions,
  AudioRecording,
  InferAudioRecordingOutput,
} from '@tanstack/ai-client'

export interface UseAudioRecorderReturn<TOutput> {
  /** Solid accessor: latest recording (transformed if `onComplete` provided), or null. */
  content: () => TOutput | null
  /** Solid accessor: true while actively capturing audio. */
  isRecording: () => boolean
  /** Whether the browser supports recording. */
  isSupported: boolean
  start: () => Promise<void>
  stop: () => Promise<TOutput>
  cancel: () => void
}

/**
 * Solid hook for recording an audio message. The resolved recording carries
 * `.part` (for `useChat.sendMessage`) and `.base64` (for generation hooks).
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
  const [isRecording, setIsRecording] = createSignal(false)
  const [content, setContent] = createSignal<TOutput | null>(null)

  const unsubscribe = recorder.subscribe((state) => {
    setIsRecording(state === 'recording')
  })

  onCleanup(() => {
    unsubscribe()
    recorder.cancel()
  })

  const stop = async (): Promise<TOutput> => {
    const recording = await recorder.stop()
    const transformed = await options.onComplete?.(recording)
    const output = (transformed ?? recording) as TOutput
    setContent(() => output)
    return output
  }

  return {
    content,
    isRecording,
    isSupported: AudioRecorder.isSupported(),
    start: () => recorder.start(),
    stop,
    cancel: () => recorder.cancel(),
  }
}
