import { injectGeneration } from './inject-generation'
import type { Signal } from '@angular/core'
import type { Model3DResult } from '@tanstack/ai'
import type {
  GenerationClientState,
  InferGenerationOutputFromReturn,
  Model3DGenerateInput,
} from '@tanstack/ai-client'
import type {
  InjectGenerationOptions,
  InjectGenerationResult,
} from './inject-generation'

/**
 * Options for {@link injectGenerate3DModel}.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 */
export type InjectGenerate3DModelOptions<TOutput = Model3DResult> = Omit<
  InjectGenerationOptions<Model3DGenerateInput, Model3DResult, TOutput>,
  'onResult' | 'reconstructResult'
> & {
  onResult?: (result: Model3DResult) => TOutput | null | void
}

/**
 * Return type of {@link injectGenerate3DModel}.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 */
export interface InjectGenerate3DModelResult<
  TOutput = Model3DResult,
> extends Omit<InjectGenerationResult<TOutput>, 'generate'> {
  generate: (input: Model3DGenerateInput) => Promise<void>
  result: Signal<TOutput | null>
  isLoading: Signal<boolean>
  error: Signal<Error | undefined>
  status: Signal<GenerationClientState>
}

/**
 * Generates a 3D model from a text or image prompt, with Angular signals.
 *
 * The server route runs `generate3DModel()` and streams the response. The
 * stream sends `generation:progress` events while the provider job runs, then
 * one `generation:result` event with the `Model3DResult`. Call it in an
 * injection context (a component field initializer, the constructor, or
 * `runInInjectionContext`).
 *
 * @param options - A `connection` (streaming) or a `fetcher` (one request),
 *   a `threadId`, and optional callbacks (`onResult`, `onProgress`, `onError`).
 *   If `onResult` returns a value, `result` holds that value.
 *
 * @example
 * ```ts
 * model = injectGenerate3DModel({
 *   threadId: 'product-model',
 *   connection: fetchServerSentEvents('/api/generate/3d-model'),
 * })
 *
 * this.model.generate({ prompt: 'A low-poly wooden chair' })
 * // this.model.result()?.url is the GLB file
 * ```
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 */
export function injectGenerate3DModel<TTransformed = void>(
  options: Omit<InjectGenerate3DModelOptions, 'onResult'> & {
    onResult?: (result: Model3DResult) => TTransformed
  },
): InjectGenerate3DModelResult<
  InferGenerationOutputFromReturn<Model3DResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'angular' as const,
    hookName: 'injectGenerate3DModel',
  }
  return injectGeneration<Model3DGenerateInput, Model3DResult, TTransformed>({
    ...options,
    devtools,
  })
}
