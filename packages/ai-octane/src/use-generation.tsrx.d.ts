// Declaration companion generated from use-generation.tsrx.
import type { StreamChunk } from '@tanstack/ai';
import type { AIDevtoolsDisplayOptions, ConnectConnectionAdapter, GenerationClientState, GenerationFetcher, InferGenerationOutputFromReturn } from '@tanstack/ai-client';
/**
 * Options for the useGeneration hook.
 *
 * Accepts either a `connection` (streaming transport) or a `fetcher` (direct async call).
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 * @template TOutput - The output type after optional transform (defaults to TResult)
 */
export interface UseGenerationOptions<TInput, TResult, TOutput = TResult> {
    /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
    connection?: ConnectConnectionAdapter;
    /** Direct async function for one-shot generation (no streaming protocol needed) */
    fetcher?: GenerationFetcher<TInput, TResult>;
    /** Unique identifier for this generation instance */
    id?: string;
    /** Additional body parameters to send with connect-based adapter requests */
    body?: Record<string, any>;
    /** Display options for TanStack AI Devtools. */
    devtools?: AIDevtoolsDisplayOptions;
    /**
     * Callback when a result is received. Can optionally return a transformed value.
     *
     * - Return a non-null value to transform and store it as the result
     * - Return `null` to keep the previous result unchanged
     * - Return nothing (`void`) to store the raw result as-is
     */
    onResult?: (result: TResult) => TOutput | null | void;
    /** Callback when an error occurs */
    onError?: (error: Error) => void;
    /** Callback when progress is reported (0-100) */
    onProgress?: (progress: number, message?: string) => void;
    /** Callback for each stream chunk (connect-based adapter mode only) */
    onChunk?: (chunk: StreamChunk) => void;
}
/**
 * Return type for the useGeneration hook.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface UseGenerationReturn<TOutput> {
    /** Trigger a generation request */
    generate: (input: Record<string, any>) => Promise<void>;
    /** The generation result, or null if not yet generated */
    result: TOutput | null;
    /** Whether a generation is currently in progress */
    isLoading: boolean;
    /** Current error, if any */
    error: Error | undefined;
    /** Current state of the generation client */
    status: GenerationClientState;
    /** Abort the current generation */
    stop: () => void;
    /** Clear result, error, and return to idle */
    reset: () => void;
}
/**
 * Generic Octane hook for one-shot generation tasks.
 *
 * This is the base hook used by `useGenerateImage`, `useGenerateSpeech`,
 * `useTranscription`, and `useSummarize`. You can also use it directly
 * for custom generation types.
 *
 * @template TInput - The input type for the generation request
 * @template TResult - The result type returned by the generation
 *
 * @example
 * ```tsx
 * const { generate, result, isLoading } = useGeneration<MyInput, MyResult>({
 *   connection: fetchServerSentEvents('/api/generate/custom'),
 * })
 *
 * await generate({ prompt: 'Hello' })
 * ```
 */
export declare function useGeneration<TInput extends Record<string, any>, TResult, TTransformed = void>(options: Omit<UseGenerationOptions<TInput, TResult>, 'onResult'> & {
    onResult?: (result: TResult) => TTransformed;
}): UseGenerationReturn<InferGenerationOutputFromReturn<TResult, TTransformed>>;
