// Declaration companion generated from use-audio-recorder.tsrx.
import type { AudioRecorderOptions, AudioRecording, InferAudioRecordingOutput } from '@tanstack/ai-client';
export type UseAudioRecorderOptions<TOnComplete> = AudioRecorderOptions & {
    /**
     * Optional transform applied to the recording when `stop()` resolves. Its
     * (awaited) return value becomes `recording` and the resolved value of
     * `stop()`. Return nothing to keep the raw `AudioRecording`.
     */
    onComplete?: TOnComplete;
};
export interface UseAudioRecorderReturn<TOutput> {
    /** Latest recording (transformed if `onComplete` provided), or null. */
    recording: TOutput | null;
    /** True while actively capturing audio. */
    isRecording: boolean;
    /** Whether the browser supports recording (getUserMedia + MediaRecorder). */
    isSupported: boolean;
    /** Acquire the mic and begin recording. */
    start: () => Promise<void>;
    /** Stop and resolve with the completed recording (transformed if `onComplete` provided). */
    stop: () => Promise<TOutput>;
    /** Discard the in-progress recording and release the mic. */
    cancel: () => void;
}
/**
 * Octane hook for recording an audio message. The resolved
 * {@link AudioRecording} carries `.part` (an audio content part for
 * `useChat.sendMessage`) and `.base64` (for the generation hooks).
 *
 * Errors are delivered via `onError`. `start()` and `stop()` also reject on
 * failure (and `stop()` rejects with `Recording cancelled` if the component
 * unmounts while a stop is in flight) — handle one channel, not both.
 *
 * @example
 * ```tsx
 * const { isRecording, start, stop, recording } = useAudioRecorder()
 * const { sendMessage } = useChat({ connection })
 * // ...
 * const rec = await stop()
 * sendMessage({ content: [rec.part] })
 * ```
 */
export declare function useAudioRecorder<TOnComplete extends (recording: AudioRecording) => unknown>(options: UseAudioRecorderOptions<TOnComplete>): UseAudioRecorderReturn<InferAudioRecordingOutput<TOnComplete>>;
export declare function useAudioRecorder(options?: UseAudioRecorderOptions<undefined>): UseAudioRecorderReturn<AudioRecording>;
