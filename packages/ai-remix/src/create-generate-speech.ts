import { createGeneration } from './create-generation.ts'
import { reconstructSpeechResult } from '@tanstack/ai-client'
import type { Handle } from 'remix/ui'
import type { TTSResult } from '@tanstack/ai'
import type {
  GenerationPersistenceOptions,
  SpeechGenerateInput,
} from '@tanstack/ai-client'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.ts'

/**
 * Options for the createGenerateSpeech helper.
 *
 * Handle is the first argument of the helper. It is not part of this type.
 *
 * @template TOutput - The output type after optional transform (defaults to TTSResult)
 */
export type CreateGenerateSpeechOptions<TOutput = TTSResult> = Omit<
  CreateGenerationOptions<SpeechGenerateInput, TTSResult, TOutput>,
  'onResult' | 'reconstructResult'
> & {
  onResult?: (result: TTSResult) => TOutput | null | void
}

/**
 * Return type for the createGenerateSpeech helper.
 *
 * @template TOutput - The output type (after optional transform)
 */
export type CreateGenerateSpeechReturn<TOutput = TTSResult> =
  CreateGenerationReturn<TOutput, SpeechGenerateInput>

/**
 * Creates a speech generation (text-to-speech) helper for Remix setup.
 *
 * Call this in a Remix component setup function. Pass the component Handle as
 * the first argument.
 *
 * @example
 * ```tsx
 * import { createGenerateSpeech } from '@tanstack/ai-remix'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 * import type { Handle } from 'remix/ui'
 *
 * function SpeechGenerator(handle: Handle) {
 *   const speech = createGenerateSpeech(handle, {
 *     connection: fetchServerSentEvents('/api/generate/speech'),
 *   })
 *
 *   return () => (
 *     <div>
 *       <button
 *         onClick={() => speech.generate({ text: 'Hello world', voice: 'alloy' })}
 *       >
 *         Generate Speech
 *       </button>
 *       {speech.result ? (
 *         <audio
 *           src={`data:audio/${speech.result.format};base64,${speech.result.audio}`}
 *           controls
 *         />
 *       ) : null}
 *     </div>
 *   )
 * }
 * ```
 */
export function createGenerateSpeech<TTransformed = void>(
  handle: Pick<Handle, 'id' | 'update' | 'signal'>,
  options: Omit<
    CreateGenerateSpeechOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: TTSResult) => TTransformed
  } & GenerationPersistenceOptions,
) {
  const devtools = {
    ...options.devtools,
    hookName: 'createGenerateSpeech',
    outputKind: 'audio' as const,
  }
  return createGeneration<SpeechGenerateInput, TTSResult, TTransformed>(
    handle,
    {
      ...options,
      devtools,
      reconstructResult: reconstructSpeechResult,
    },
  )
}
