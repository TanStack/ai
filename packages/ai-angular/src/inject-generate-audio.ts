import { injectGeneration } from './inject-generation'
import type { AudioGenerationResult, StreamChunk } from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  AudioGenerateInput,
  ConnectConnectionAdapter,
  GenerationClientState,
  GenerationFetcher,
  InferGenerationOutputFromReturn,
} from '@tanstack/ai-client'
import type { Signal } from '@angular/core'
import type { ReactiveOption } from './internal/to-reactive'
import type {
  InjectGenerationOptions,
  InjectGenerationResult,
} from './inject-generation'

/**
 * Options for the injectGenerateAudio injectable.
 *
 * @template TOutput - The output type after optional transform (defaults to AudioGenerationResult)
 */
export interface InjectGenerateAudioOptions<
  TOutput = AudioGenerationResult,
> extends Pick<
  InjectGenerationOptions<AudioGenerateInput, AudioGenerationResult, TOutput>,
  'persistence' | 'autoResume' | 'initialResumeSnapshot' | 'resumeState'
> {
  /** Connect-based adapter for streaming transport (SSE, HTTP stream, custom) */
  connection?: ConnectConnectionAdapter
  /** Direct async function for audio generation */
  fetcher?: GenerationFetcher<AudioGenerateInput, AudioGenerationResult>
  /** Unique identifier for this generation instance */
  id?: string
  /** Additional body parameters to send with connect-based adapter requests. Reactive. */
  body?: ReactiveOption<Record<string, any>>
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /**
   * Callback when audio is generated. Can optionally return a transformed value.
   *
   * - Return a non-null value to transform and store it as the result
   * - Return `null` to keep the previous result unchanged
   * - Return nothing (`void`) to store the raw result as-is
   */
  onResult?: (result: AudioGenerationResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Return type for the injectGenerateAudio injectable.
 *
 * @template TOutput - The output type (after optional transform)
 */
export interface InjectGenerateAudioResult<
  TOutput = AudioGenerationResult,
> extends Omit<InjectGenerationResult<TOutput>, 'generate'> {
  /** Trigger audio generation */
  generate: (input: AudioGenerateInput) => Promise<void>
  /** The generation result containing audio, or null */
  result: Signal<TOutput | null>
  /** Whether generation is in progress */
  isLoading: Signal<boolean>
  /** Current error, if any */
  error: Signal<Error | undefined>
  /** Current state of the generation */
  status: Signal<GenerationClientState>
}

/**
 * Angular injectable for generating audio (music, sound effects) using AI models.
 *
 * @example
 * ```typescript
 * import { Component } from '@angular/core'
 * import { injectGenerateAudio } from '@tanstack/ai-angular'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 *
 * @Component({
 *   selector: 'app-audio',
 *   template: `
 *     <button (click)="generate({ prompt: 'An upbeat electronic track', duration: 10 })">
 *       Generate
 *     </button>
 *     @if (result()) {
 *       <audio [src]="result()!.audio.url" controls></audio>
 *     }
 *   `,
 * })
 * export class AudioComponent {
 *   private gen = injectGenerateAudio({
 *     connection: fetchServerSentEvents('/api/generate/audio'),
 *   })
 *
 *   generate = this.gen.generate
 *   result = this.gen.result
 *   isLoading = this.gen.isLoading
 * }
 * ```
 */
export function injectGenerateAudio<TTransformed = void>(
  options: Omit<InjectGenerateAudioOptions, 'onResult'> & {
    onResult?: (result: AudioGenerationResult) => TTransformed
  },
): InjectGenerateAudioResult<
  InferGenerationOutputFromReturn<AudioGenerationResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'angular',
    hookName: 'injectGenerateAudio',
    outputKind: 'audio' as const,
  }
  const generation = injectGeneration<
    AudioGenerateInput,
    AudioGenerationResult,
    TTransformed
  >({
    ...options,
    devtools,
  })

  return {
    ...generation,
    generate: generation.generate as (
      input: AudioGenerateInput,
    ) => Promise<void>,
  }
}
