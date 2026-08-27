import { createSignal, onCleanup } from 'solid-js'
import { AudioRecorder } from '@tanstack/ai-client'
import type {
  AudioRecorderOptions,
  AudioRecording,
  InferAudioRecordingOutput,
} from '@tanstack/ai-client'

export type UseAudioRecorderOptions<TOnComplete> = AudioRecorderOptions & {
  onComplete?: TOnComplete
}

export interface UseAudioRecorderReturn<TOutput> {
  /** Solid accessor: latest recording (transformed if `onComplete` provided), or null. */
  recording: () => TOutput | null
  /** Solid accessor: true while actively capturing audio. */
  isRecording: () => boolean
  /** Whether the browser supports recording. */
  isSupported: boolean
  start: () => Promise<void>
  /** Stop and resolve with the completed recording (transformed if `onComplete` provided). */
  stop: () => Promise<TOutput>
  /** Discard the in-progress recording and release the mic. */
  cancel: () => void
}

export function useAudioRecorder<
  TOnComplete extends (recording: AudioRecording) => unknown,
>(
  options: UseAudioRecorderOptions<TOnComplete> & { onComplete: TOnComplete },
): UseAudioRecorderReturn<InferAudioRecordingOutput<TOnComplete>>
export function useAudioRecorder(
  options?: UseAudioRecorderOptions<undefined>,
): UseAudioRecorderReturn<AudioRecording>
export function useAudioRecorder(
  options: UseAudioRecorderOptions<(recording: AudioRecording) => unknown> = {},
): UseAudioRecorderReturn<unknown> {
  const recorder = new AudioRecorder({
    ...(options.audio !== undefined && { audio: options.audio }),
    ...(options.mimeType !== undefined && { mimeType: options.mimeType }),
    ...(options.onError !== undefined && { onError: options.onError }),
  })
  const [isRecording, setIsRecording] = createSignal(false)
  const [recording, setRecording] = createSignal<unknown>(null)

  const unsubscribe = recorder.subscribe((state) => {
    setIsRecording(state === 'recording')
  })

  onCleanup(() => {
    unsubscribe()
    recorder.cancel()
  })

  const stop = async (): Promise<unknown> => {
    const rawRecording = await recorder.stop()
    const transformed = await options.onComplete?.(rawRecording)
    // Only `undefined` (returning nothing) keeps the raw recording; a returned
    // null is a real value, matching the inferred output type.
    const output = transformed === undefined ? rawRecording : transformed
    // Store via updater so a function-valued transform result isn't invoked.
    setRecording(() => output)
    return output
  }

  return {
    recording,
    isRecording,
    isSupported: AudioRecorder.isSupported(),
    start: () => recorder.start(),
    stop,
    cancel: () => recorder.cancel(),
  }
}
