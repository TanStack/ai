import { AudioRecorder } from '@tanstack/ai-client'
import type {
  AudioRecorderOptions,
  AudioRecording,
  InferAudioRecordingOutput,
} from '@tanstack/ai-client'

export type CreateAudioRecorderOptions<TOnComplete> = AudioRecorderOptions & {
  onComplete?: TOnComplete
}

export interface CreateAudioRecorderReturn<TOutput> {
  /** Reactive: latest recording (transformed if `onComplete` provided), or null. */
  readonly recording: TOutput | null
  /** Reactive: true while actively capturing audio. */
  readonly isRecording: boolean
  /** Whether the browser supports recording. */
  readonly isSupported: boolean
  start: () => Promise<void>
  /** Stop and resolve with the completed recording (transformed if `onComplete` provided). */
  stop: () => Promise<TOutput>
  cancel: () => void
}

export function createAudioRecorder<
  TOnComplete extends (recording: AudioRecording) => unknown,
>(
  options: CreateAudioRecorderOptions<TOnComplete> & {
    onComplete: TOnComplete
  },
): CreateAudioRecorderReturn<InferAudioRecordingOutput<TOnComplete>>
export function createAudioRecorder(
  options?: CreateAudioRecorderOptions<undefined>,
): CreateAudioRecorderReturn<AudioRecording>
export function createAudioRecorder(
  options: CreateAudioRecorderOptions<
    (recording: AudioRecording) => unknown
  > = {},
): CreateAudioRecorderReturn<unknown> {
  const recorder = new AudioRecorder({
    ...(options.audio !== undefined && { audio: options.audio }),
    ...(options.mimeType !== undefined && { mimeType: options.mimeType }),
    ...(options.onError !== undefined && { onError: options.onError }),
  })
  let isRecording = $state(false)
  let recording = $state<unknown>(null)

  recorder.subscribe((state) => {
    isRecording = state === 'recording'
  })

  const stop = async (): Promise<unknown> => {
    const rawRecording = await recorder.stop()
    const transformed = await options.onComplete?.(rawRecording)
    // Only `undefined` (returning nothing) keeps the raw recording; a returned
    // null is a real value, matching the inferred output type.
    const output = transformed === undefined ? rawRecording : transformed
    recording = output
    return output
  }

  return {
    get recording() {
      return recording
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
