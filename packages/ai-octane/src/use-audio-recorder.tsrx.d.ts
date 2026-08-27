// Declaration companion generated from use-audio-recorder.tsrx.
import type {
  AudioRecorderOptions,
  AudioRecording,
  InferAudioRecordingOutput,
} from '@tanstack/ai-client'

export type UseAudioRecorderOptions<TOnComplete> = AudioRecorderOptions & {
  onComplete?: TOnComplete
}
export interface UseAudioRecorderReturn<TOutput> {
  /** Latest recording (transformed if `onComplete` provided), or null. */
  recording: TOutput | null
  /** True while actively capturing audio. */
  isRecording: boolean
  /** Whether the browser supports recording (getUserMedia + MediaRecorder). */
  isSupported: boolean
  /** Acquire the mic and begin recording. */
  start: () => Promise<void>
  /** Stop and resolve with the completed recording (transformed if `onComplete` provided). */
  stop: () => Promise<TOutput>
  /** Discard the in-progress recording and release the mic. */
  cancel: () => void
}
export declare function useAudioRecorder<
  TOnComplete extends (recording: AudioRecording) => unknown,
>(
  options: UseAudioRecorderOptions<TOnComplete> & { onComplete: TOnComplete },
): UseAudioRecorderReturn<InferAudioRecordingOutput<TOnComplete>>
export declare function useAudioRecorder(
  options?: UseAudioRecorderOptions<undefined>,
): UseAudioRecorderReturn<AudioRecording>
