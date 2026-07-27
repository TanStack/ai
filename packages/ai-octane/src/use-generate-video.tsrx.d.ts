// Declaration companion generated from use-generate-video.tsrx.
import type { StreamChunk } from '@tanstack/ai';
import type { AIDevtoolsDisplayOptions, ConnectConnectionAdapter, GenerationClientState, GenerationFetcher, InferGenerationOutputFromReturn, VideoGenerateInput, VideoGenerateResult, VideoStatusInfo } from '@tanstack/ai-client';
/**
 * Options for the useGenerateVideo hook.
 */
export interface UseGenerateVideoOptions<TOutput = VideoGenerateResult> {
    /** Connect-based adapter for streaming transport (server handles polling) */
    connection?: ConnectConnectionAdapter;
    /** Direct async function that returns a completed video result */
    fetcher?: GenerationFetcher<VideoGenerateInput, VideoGenerateResult>;
    /** Unique identifier for this generation instance */
    id?: string;
    /** Additional body parameters to send with connect-based adapter requests */
    body?: Record<string, any>;
    /** Display options for TanStack AI Devtools. */
    devtools?: AIDevtoolsDisplayOptions;
    /**
     * Callback when video generation completes. Can optionally return a transformed value.
     *
     * - Return a non-null value to transform and store it as the result
     * - Return `null` to keep the previous result unchanged
     * - Return nothing (`void`) to store the raw result as-is
     */
    onResult?: (result: VideoGenerateResult) => TOutput | null | void;
    /** Callback when an error occurs */
    onError?: (error: Error) => void;
    /** Callback when progress is reported (0-100) */
    onProgress?: (progress: number, message?: string) => void;
    /** Callback when a video job is created */
    onJobCreated?: (jobId: string) => void;
    /** Callback on each status update */
    onStatusUpdate?: (status: VideoStatusInfo) => void;
    /** Callback for each stream chunk (connect-based adapter mode only) */
    onChunk?: (chunk: StreamChunk) => void;
}
/**
 * Return type for the useGenerateVideo hook.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerateVideoReturn<TOutput = VideoGenerateResult> {
    /** Trigger video generation */
    generate: (input: VideoGenerateInput) => Promise<void>;
    /** The final video result (with URL), or null */
    result: TOutput | null;
    /** The current job ID, or null */
    jobId: string | null;
    /** Current video generation status info, or null */
    videoStatus: VideoStatusInfo | null;
    /** Whether generation/polling is in progress */
    isLoading: boolean;
    /** Current error, if any */
    error: Error | undefined;
    /** Current state of the generation */
    status: GenerationClientState;
    /** Abort the current generation/polling */
    stop: () => void;
    /** Clear all state and return to idle */
    reset: () => void;
}
/**
 * Octane hook for generating videos using AI models.
 *
 * Video generation is asynchronous: a job is created, then polled for status
 * until completion. This hook handles the full lifecycle.
 *
 * @example
 * ```tsx
 * import { useGenerateVideo } from '@tanstack/ai-octane'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * function VideoGenerator() {
 *   const { generate, result, videoStatus, isLoading } = useGenerateVideo({
 *     connection: fetchServerSentEvents('/api/generate/video'),
 *     onStatusUpdate: (status) => console.log(`Progress: ${status.progress}%`),
 *   })
 *
 *   return (
 *     <div>
 *       <button onClick={() => generate({ prompt: 'A flying car over a city' })}>
 *         Generate Video
 *       </button>
 *       {isLoading && videoStatus && (
 *         <p>Status: {videoStatus.status} ({videoStatus.progress}%)</p>
 *       )}
 *       {result && <video src={result.url} controls />}
 *     </div>
 *   )
 * }
 * ```
 */
export declare function useGenerateVideo<TTransformed = void>(options: Omit<UseGenerateVideoOptions, 'onResult'> & {
    onResult?: (result: VideoGenerateResult) => TTransformed;
}): UseGenerateVideoReturn<InferGenerationOutputFromReturn<VideoGenerateResult, TTransformed>>;
