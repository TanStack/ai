import { describe, expectTypeOf, it } from 'vitest'
import type { AnyClientTool } from '@tanstack/ai'
import type { AIDevtoolsDisplayOptions } from '@tanstack/ai-client'
import type { UseChatOptions } from '../src/types'
import type { UseGenerateAudioOptions } from '../src/use-generate-audio'
import type { UseGenerateImageOptions } from '../src/use-generate-image'
import type { UseGenerateSpeechOptions } from '../src/use-generate-speech'
import type { UseGenerateVideoOptions } from '../src/use-generate-video'
import type { UseGenerationOptions } from '../src/use-generation'
import type { UseSummarizeOptions } from '../src/use-summarize'
import type { UseTranscriptionOptions } from '../src/use-transcription'

type NoTools = ReadonlyArray<AnyClientTool>
type CustomGenerationInput = { prompt: string }
type CustomGenerationResult = { text: string }
type DevtoolsOf<T extends { devtools?: unknown }> = NonNullable<T['devtools']>

describe('React devtools display options', () => {
  it('limits hook config to the public display-name shape', () => {
    expectTypeOf<
      DevtoolsOf<UseChatOptions<NoTools>>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<
        UseGenerationOptions<CustomGenerationInput, CustomGenerationResult>
      >
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<UseGenerateImageOptions>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<UseGenerateAudioOptions>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<UseGenerateSpeechOptions>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<UseTranscriptionOptions>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<UseSummarizeOptions>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
    expectTypeOf<
      DevtoolsOf<UseGenerateVideoOptions>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
  })
})
