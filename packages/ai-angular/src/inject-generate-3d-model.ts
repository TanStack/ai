import { injectGeneration } from './inject-generation'
import type { Signal } from '@angular/core'
import type { Model3dResult } from '@tanstack/ai'
import type {
  GenerationClientState,
  InferGenerationOutputFromReturn,
  Model3dGenerateInput,
} from '@tanstack/ai-client'
import type {
  InjectGenerationOptions,
  InjectGenerationResult,
} from './inject-generation'

/**
 * Options for {@link injectGenerate3dModel}.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 */
export type InjectGenerate3dModelOptions<TOutput = Model3dResult> = Omit<
  InjectGenerationOptions<Model3dGenerateInput, Model3dResult, TOutput>,
  | 'onResult'
  | 'reconstructResult'
  | 'persistence'
  | 'hydrateGeneration'
  | 'joinRun'
> & {
  onResult?: (result: Model3dResult) => TOutput | null | void
}

/**
 * Return type of {@link injectGenerate3dModel}.
 *
 * @experimental 3D model generation is experimental. The shape can change in
 * a minor release.
 */
export interface InjectGenerate3dModelResult<
  TOutput = Model3dResult,
> extends Omit<InjectGenerationResult<TOutput>, 'generate'> {
  generate: (input: Model3dGenerateInput) => Promise<void>
  result: Signal<TOutput | null>
  isLoading: Signal<boolean>
  error: Signal<Error | undefined>
  status: Signal<GenerationClientState>
}

/**
 * Generates a 3D model from a text or image prompt, with Angular signals.
 *
 * The server route runs `generate3dModel()` and streams the response. The
 * stream sends `generation:progress` events while the provider job runs, then
 * one `generation:result` event with the `Model3dResult`. Call it in an
 * injection context (a component field initializer, the constructor, or
 * `runInInjectionContext`).
 *
 * @param options - A `connection` (streaming) or a `fetcher` (one request),
 *   a `threadId`, and optional callbacks (`onResult`, `onProgress`, `onError`).
 *   If `onResult` returns a value, `result` holds that value.
 *
 * @example
 * ```ts
 * model = injectGenerate3dModel({
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
export function injectGenerate3dModel<TTransformed = void>(
  options: Omit<InjectGenerate3dModelOptions, 'onResult'> & {
    onResult?: (result: Model3dResult) => TTransformed
  },
): InjectGenerate3dModelResult<
  InferGenerationOutputFromReturn<Model3dResult, TTransformed>
> {
  const devtools = {
    ...options.devtools,
    framework: 'angular' as const,
    hookName: 'injectGenerate3dModel',
  }
  return injectGeneration<Model3dGenerateInput, Model3dResult, TTransformed>({
    ...options,
    devtools,
    // 3D results are never persisted, even if an untyped caller sets it.
    persistence: false,
  })
}
