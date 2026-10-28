import { describe, expectTypeOf, it } from 'vitest'
import type { AnyClientTool } from '@tanstack/ai'
import type { AIDevtoolsDisplayOptions } from '@tanstack/ai-client'
import type { CreateGenerateAudioOptions } from '../src/create-generate-audio.svelte'
import type { CreateGenerateImageOptions } from '../src/create-generate-image.svelte'
import type { CreateGenerateSpeechOptions } from '../src/create-generate-speech.svelte'
import type { CreateGenerateVideoOptions } from '../src/create-generate-video.svelte'
import type { CreateGenerationOptions } from '../src/create-generation.svelte'
import type { CreateSummarizeOptions } from '../src/create-summarize.svelte'
import type { CreateTranscriptionOptions } from '../src/create-transcription.svelte'
import type { CreateChatOptions } from '../src/types'

type NoTools = ReadonlyArray<AnyClientTool>
type CustomGenerationInput = { prompt: string }
type CustomGenerationResult = { text: string }
type DevtoolsOf<T extends { devtools?: unknown }> = NonNullable<T['devtools']>

describe('Svelte devtools display options', () => {
  it('limits hook config to the public display-name shape', () => {
    expectTypeOf<
      DevtoolsOf<CreateChatOptions<NoTools>>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<
        CreateGenerationOptions<CustomGenerationInput, CustomGenerationResult>
      >
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<CreateGenerateImageOptions>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<CreateGenerateAudioOptions>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<CreateGenerateSpeechOptions>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<CreateTranscriptionOptions>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<CreateSummarizeOptions>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<CreateGenerateVideoOptions>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
  })
})
