/**
 * Model-id type-safety tests for the Lovable adapters.
 *
 * Positive cases: curated model ids compile cleanly.
 * Negative cases: uncurated ids produce a `@ts-expect-error`.
 */
import { describe, it } from 'vitest'
import {
  createLovableEmbedding,
  createLovableImage,
  createLovableResponsesText,
  createLovableSpeech,
  createLovableSummarize,
  createLovableText,
  createLovableTranscription,
  createLovableVideo,
} from '../src'

describe('Lovable model-id gating', () => {
  it('accepts curated model ids', () => {
    createLovableText('google/gemini-3.7-flash', 'k')
    createLovableResponsesText('openai/gpt-5.5', 'k')
    createLovableSummarize('openai/gpt-5.5', 'k')
    createLovableImage('openai/gpt-image-2', 'k')
    createLovableVideo('google/veo-3.1-lite', 'k')
    createLovableEmbedding('openai/text-embedding-3-small', 'k')
    createLovableSpeech('openai/gpt-4o-mini-tts', 'k')
    createLovableTranscription('openai/gpt-4o-mini-transcribe', 'k')
  })

  it('rejects uncurated model ids', () => {
    // @ts-expect-error - not a curated chat model
    createLovableText('openai/not-a-model', 'k')
    // @ts-expect-error - not a curated chat model
    createLovableResponsesText('openai/not-a-model', 'k')
    // @ts-expect-error - not a curated chat model
    createLovableSummarize('openai/not-a-model', 'k')
    // @ts-expect-error - not a curated image model
    createLovableImage('openai/not-a-model', 'k')
    // @ts-expect-error - not a curated video model
    createLovableVideo('openai/not-a-model', 'k')
    // @ts-expect-error - not a curated embedding model
    createLovableEmbedding('openai/not-a-model', 'k')
    // @ts-expect-error - not a curated TTS model
    createLovableSpeech('openai/not-a-model', 'k')
    // @ts-expect-error - not a curated transcription model
    createLovableTranscription('openai/not-a-model', 'k')
  })
})
