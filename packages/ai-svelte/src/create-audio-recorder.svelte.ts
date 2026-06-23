import { AudioRecorder } from '@tanstack/ai-client'
import type {
  AudioRecorderOptions,
  AudioRecording,
  InferAudioRecordingOutput,
} from '@tanstack/ai-client'

export interface CreateAudioRecorderReturn<TOutput> {
  /** Reactive: latest recording (transformed if `onComplete` provided), or null. */
  readonly content: TOutput | null
  /** Reactive: true while actively capturing audio. */
  readonly isRecording: boolean
  /** Whether the browser supports recording. */
  readonly isSupported: boolean
  start: () => Promise<void>
  stop: () => Promise<TOutput>
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
export function createAudioRecorder<
  TOnComplete extends ((recording: AudioRecording) => any) | undefined =
    undefined,
>(
  options: AudioRecorderOptions & { onComplete?: TOnComplete } = {},
): CreateAudioRecorderReturn<InferAudioRecordingOutput<TOnComplete>> {
  type TOutput = InferAudioRecordingOutput<TOnComplete>
  const recorder = new AudioRecorder({
    ...(options.audio !== undefined && { audio: options.audio }),
    ...(options.mimeType !== undefined && { mimeType: options.mimeType }),
    ...(options.onError !== undefined && { onError: options.onError }),
  })
  let isRecording = $state(false)
  let content = $state<TOutput | null>(null)

  recorder.subscribe((state) => {
    isRecording = state === 'recording'
  })

  const stop = async (): Promise<TOutput> => {
    const recording = await recorder.stop()
    const transformed = await options.onComplete?.(recording)
    const output = (transformed ?? recording) as TOutput
    content = output
    return output
  }

  return {
    get content() {
      return content
    },
    get isRecording() {
      return isRecording
    },
    get isSupported() {
      return AudioRecorder.isSupported()
    },
    start: () => recorder.start(),
    stop,
    cancel: () => recorder.cancel(),
  }
}
