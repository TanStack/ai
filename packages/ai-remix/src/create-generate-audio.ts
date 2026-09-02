import { createGeneration } from './create-generation.ts'
import { reconstructAudioResult } from '@tanstack/ai-client'
import type { Handle } from 'remix/ui'
import type { AudioGenerationResult } from '@tanstack/ai'
import type {
  AudioGenerateInput,
  GenerationPersistenceOptions,
} from '@tanstack/ai-client'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.ts'

/**
 * Options for the createGenerateAudio helper.
 *
 * Handle is the first argument of the helper. It is not part of this type.
 *
 * @template TOutput - The output type after optional transform (defaults to AudioGenerationResult)
 */
export type CreateGenerateAudioOptions<TOutput = AudioGenerationResult> = Omit<
  CreateGenerationOptions<AudioGenerateInput, AudioGenerationResult, TOutput>,
  'onResult' | 'reconstructResult'
> & {
  onResult?: (result: AudioGenerationResult) => TOutput | null | void
}

/**
 * Return type for the createGenerateAudio helper.
 *
 * @template TOutput - The output type (after optional transform)
 */
export type CreateGenerateAudioReturn<TOutput = AudioGenerationResult> =
  CreateGenerationReturn<TOutput, AudioGenerateInput>

/**
 * Creates an audio generation helper for Remix setup.
 *
 * Call this in a Remix component setup function. Pass the component Handle as
 * the first argument.
 *
 * @example
 * ```tsx
 * import { createGenerateAudio } from '@tanstack/ai-remix'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 * import type { Handle } from 'remix/ui'
 *
 * function AudioGenerator(handle: Handle) {
 *   const audio = createGenerateAudio(handle, {
 *     connection: fetchServerSentEvents('/api/generate/audio'),
 *   })
 *
 *   return () => (
 *     <div>
 *       <button
 *         onClick={() =>
 *           audio.generate({ prompt: 'An upbeat electronic track', duration: 10 })
 *         }
 *       >
 *         Generate
 *       </button>
 *       {audio.result?.audio.url ? (
 *         <audio src={audio.result.audio.url} controls />
 *       ) : null}
 *     </div>
 *   )
 * }
 * ```
 */
export function createGenerateAudio<TTransformed = void>(
  handle: Pick<Handle, 'id' | 'update' | 'signal'>,
  options: Omit<
    CreateGenerateAudioOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: AudioGenerationResult) => TTransformed
  } & GenerationPersistenceOptions,
) {
  const devtools = {
    ...options.devtools,
    hookName: 'createGenerateAudio',
    outputKind: 'audio' as const,
  }
  return createGeneration<
    AudioGenerateInput,
    AudioGenerationResult,
    TTransformed
  >(handle, {
    ...options,
    devtools,
    reconstructResult: reconstructAudioResult,
  })
}
