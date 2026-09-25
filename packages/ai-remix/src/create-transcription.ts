import { createGeneration } from './create-generation.ts'
import { reconstructTranscriptionResult } from '@tanstack/ai-client'
import type { Handle } from 'remix/ui'
import type { TranscriptionResult } from '@tanstack/ai'
import type {
  GenerationPersistenceOptions,
  TranscriptionGenerateInput,
} from '@tanstack/ai-client'
import type {
  CreateGenerationOptions,
  CreateGenerationReturn,
} from './create-generation.ts'

/**
 * Options for the createTranscription helper.
 *
 * Handle is the first argument of the helper. It is not part of this type.
 *
 * @template TOutput - The output type after optional transform (defaults to TranscriptionResult)
 */
export type CreateTranscriptionOptions<TOutput = TranscriptionResult> = Omit<
  CreateGenerationOptions<
    TranscriptionGenerateInput,
    TranscriptionResult,
    TOutput
  >,
  'onResult' | 'reconstructResult'
> & {
  onResult?: (result: TranscriptionResult) => TOutput | null | void
}

/**
 * Return type for the createTranscription helper.
 *
 * @template TOutput - The output type (after optional transform)
 */
export type CreateTranscriptionReturn<TOutput = TranscriptionResult> =
  CreateGenerationReturn<TOutput, TranscriptionGenerateInput>

/**
 * Creates an audio transcription helper for Remix setup.
 *
 * Call this in a Remix component setup function. Pass the component Handle as
 * the first argument.
 *
 * @example
 * ```tsx
 * import { createTranscription } from '@tanstack/ai-remix'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 * import type { Handle } from 'remix/ui'
 *
 * function Transcriber(handle: Handle) {
 *   const transcription = createTranscription(handle, {
 *     connection: fetchServerSentEvents('/api/transcribe'),
 *   })
 *
 *   return () => (
 *     <div>
 *       <input
 *         type="file"
 *         accept="audio/*"
 *         onChange={(event) => {
 *           const file = event.currentTarget.files?.[0]
 *           if (!file) return
 *           const reader = new FileReader()
 *           reader.onload = () => {
 *             const audio = reader.result
 *             if (typeof audio === 'string') {
 *               transcription.generate({ audio, language: 'en' })
 *             }
 *           }
 *           reader.readAsDataURL(file)
 *         }}
 *       />
 *       {transcription.isLoading ? <p>Transcribing...</p> : null}
 *       {transcription.result ? <p>{transcription.result.text}</p> : null}
 *     </div>
 *   )
 * }
 * ```
 */
export function createTranscription<TTransformed = void>(
  handle: Pick<Handle, 'id' | 'update' | 'signal'>,
  options: Omit<
    CreateTranscriptionOptions,
    'onResult' | 'persistence' | 'threadId'
  > & {
    onResult?: (result: TranscriptionResult) => TTransformed
  } & GenerationPersistenceOptions,
) {
  const devtools = {
    ...options.devtools,
    hookName: 'createTranscription',
    outputKind: 'text' as const,
  }
  return createGeneration<
    TranscriptionGenerateInput,
    TranscriptionResult,
    TTransformed
  >(handle, {
    ...options,
    devtools,
    reconstructResult: reconstructTranscriptionResult,
  })
}
