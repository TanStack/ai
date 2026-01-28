// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaAceStepInput,
  zSchemaAceStepOutput,
  zSchemaAceStepPromptToAudioInput,
  zSchemaAceStepPromptToAudioOutput,
  zSchemaCsm1bInput,
  zSchemaCsm1bOutput,
  zSchemaDiffrhythmInput,
  zSchemaDiffrhythmOutput,
  zSchemaElevenlabsMusicInput,
  zSchemaElevenlabsMusicOutput,
  zSchemaElevenlabsSoundEffectsV2Input,
  zSchemaElevenlabsSoundEffectsV2Output,
  zSchemaElevenlabsTtsElevenV3Input,
  zSchemaElevenlabsTtsElevenV3Output,
  zSchemaElevenlabsTtsMultilingualV2Input,
  zSchemaElevenlabsTtsMultilingualV2Output,
  zSchemaF5TtsInput,
  zSchemaF5TtsOutput,
  zSchemaKokoroAmericanEnglishInput,
  zSchemaKokoroAmericanEnglishOutput,
  zSchemaKokoroBrazilianPortugueseInput,
  zSchemaKokoroBrazilianPortugueseOutput,
  zSchemaKokoroBritishEnglishInput,
  zSchemaKokoroBritishEnglishOutput,
  zSchemaKokoroFrenchInput,
  zSchemaKokoroFrenchOutput,
  zSchemaKokoroHindiInput,
  zSchemaKokoroHindiOutput,
  zSchemaKokoroItalianInput,
  zSchemaKokoroItalianOutput,
  zSchemaKokoroJapaneseInput,
  zSchemaKokoroJapaneseOutput,
  zSchemaKokoroMandarinChineseInput,
  zSchemaKokoroMandarinChineseOutput,
  zSchemaKokoroSpanishInput,
  zSchemaKokoroSpanishOutput,
  zSchemaLyria2Input,
  zSchemaLyria2Output,
  zSchemaMinimaxMusicInput,
  zSchemaMinimaxMusicOutput,
  zSchemaMinimaxMusicV15Input,
  zSchemaMinimaxMusicV15Output,
  zSchemaMinimaxMusicV2Input,
  zSchemaMinimaxMusicV2Output,
  zSchemaMmaudioV2TextToAudioInput,
  zSchemaMmaudioV2TextToAudioOutput,
  zSchemaMusicGenerationInput,
  zSchemaMusicGenerationOutput,
  zSchemaMusicGeneratorInput,
  zSchemaMusicGeneratorOutput,
  zSchemaSoundEffectGenerationInput,
  zSchemaSoundEffectGenerationOutput,
  zSchemaSoundEffectsGeneratorInput,
  zSchemaSoundEffectsGeneratorOutput,
  zSchemaStableAudio25TextToAudioInput,
  zSchemaStableAudio25TextToAudioOutput,
  zSchemaStableAudioInput,
  zSchemaStableAudioOutput,
  zSchemaV2InpaintInput,
  zSchemaV2InpaintOutput,
  zSchemaV2TextToMusicInput,
  zSchemaV2TextToMusicOutput,
  zSchemaYueInput,
  zSchemaYueOutput,
  zSchemaZonosInput,
  zSchemaZonosOutput,
} from './zod.gen'

import type {
  SchemaAceStepInput,
  SchemaAceStepOutput,
  SchemaAceStepPromptToAudioInput,
  SchemaAceStepPromptToAudioOutput,
  SchemaCsm1bInput,
  SchemaCsm1bOutput,
  SchemaDiffrhythmInput,
  SchemaDiffrhythmOutput,
  SchemaElevenlabsMusicInput,
  SchemaElevenlabsMusicOutput,
  SchemaElevenlabsSoundEffectsV2Input,
  SchemaElevenlabsSoundEffectsV2Output,
  SchemaElevenlabsTtsElevenV3Input,
  SchemaElevenlabsTtsElevenV3Output,
  SchemaElevenlabsTtsMultilingualV2Input,
  SchemaElevenlabsTtsMultilingualV2Output,
  SchemaF5TtsInput,
  SchemaF5TtsOutput,
  SchemaKokoroAmericanEnglishInput,
  SchemaKokoroAmericanEnglishOutput,
  SchemaKokoroBrazilianPortugueseInput,
  SchemaKokoroBrazilianPortugueseOutput,
  SchemaKokoroBritishEnglishInput,
  SchemaKokoroBritishEnglishOutput,
  SchemaKokoroFrenchInput,
  SchemaKokoroFrenchOutput,
  SchemaKokoroHindiInput,
  SchemaKokoroHindiOutput,
  SchemaKokoroItalianInput,
  SchemaKokoroItalianOutput,
  SchemaKokoroJapaneseInput,
  SchemaKokoroJapaneseOutput,
  SchemaKokoroMandarinChineseInput,
  SchemaKokoroMandarinChineseOutput,
  SchemaKokoroSpanishInput,
  SchemaKokoroSpanishOutput,
  SchemaLyria2Input,
  SchemaLyria2Output,
  SchemaMinimaxMusicInput,
  SchemaMinimaxMusicOutput,
  SchemaMinimaxMusicV15Input,
  SchemaMinimaxMusicV15Output,
  SchemaMinimaxMusicV2Input,
  SchemaMinimaxMusicV2Output,
  SchemaMmaudioV2TextToAudioInput,
  SchemaMmaudioV2TextToAudioOutput,
  SchemaMusicGenerationInput,
  SchemaMusicGenerationOutput,
  SchemaMusicGeneratorInput,
  SchemaMusicGeneratorOutput,
  SchemaSoundEffectGenerationInput,
  SchemaSoundEffectGenerationOutput,
  SchemaSoundEffectsGeneratorInput,
  SchemaSoundEffectsGeneratorOutput,
  SchemaStableAudio25TextToAudioInput,
  SchemaStableAudio25TextToAudioOutput,
  SchemaStableAudioInput,
  SchemaStableAudioOutput,
  SchemaV2InpaintInput,
  SchemaV2InpaintOutput,
  SchemaV2TextToMusicInput,
  SchemaV2TextToMusicOutput,
  SchemaYueInput,
  SchemaYueOutput,
  SchemaZonosInput,
  SchemaZonosOutput,
} from './types.gen'

export type TextToAudioEndpointMap = {
  'fal-ai/elevenlabs/music': {
    input: SchemaElevenlabsMusicInput
    output: SchemaElevenlabsMusicOutput
  }
  'fal-ai/minimax-music/v2': {
    input: SchemaMinimaxMusicV2Input
    output: SchemaMinimaxMusicV2Output
  }
  'beatoven/sound-effect-generation': {
    input: SchemaSoundEffectGenerationInput
    output: SchemaSoundEffectGenerationOutput
  }
  'beatoven/music-generation': {
    input: SchemaMusicGenerationInput
    output: SchemaMusicGenerationOutput
  }
  'fal-ai/minimax-music/v1.5': {
    input: SchemaMinimaxMusicV15Input
    output: SchemaMinimaxMusicV15Output
  }
  'fal-ai/stable-audio-25/text-to-audio': {
    input: SchemaStableAudio25TextToAudioInput
    output: SchemaStableAudio25TextToAudioOutput
  }
  'fal-ai/elevenlabs/sound-effects/v2': {
    input: SchemaElevenlabsSoundEffectsV2Input
    output: SchemaElevenlabsSoundEffectsV2Output
  }
  'sonauto/v2/inpaint': {
    input: SchemaV2InpaintInput
    output: SchemaV2InpaintOutput
  }
  'sonauto/v2/text-to-music': {
    input: SchemaV2TextToMusicInput
    output: SchemaV2TextToMusicOutput
  }
  'fal-ai/elevenlabs/tts/eleven-v3': {
    input: SchemaElevenlabsTtsElevenV3Input
    output: SchemaElevenlabsTtsElevenV3Output
  }
  'fal-ai/lyria2': {
    input: SchemaLyria2Input
    output: SchemaLyria2Output
  }
  'fal-ai/ace-step/prompt-to-audio': {
    input: SchemaAceStepPromptToAudioInput
    output: SchemaAceStepPromptToAudioOutput
  }
  'fal-ai/ace-step': {
    input: SchemaAceStepInput
    output: SchemaAceStepOutput
  }
  'cassetteai/sound-effects-generator': {
    input: SchemaSoundEffectsGeneratorInput
    output: SchemaSoundEffectsGeneratorOutput
  }
  'cassetteai/music-generator': {
    input: SchemaMusicGeneratorInput
    output: SchemaMusicGeneratorOutput
  }
  'fal-ai/csm-1b': {
    input: SchemaCsm1bInput
    output: SchemaCsm1bOutput
  }
  'fal-ai/diffrhythm': {
    input: SchemaDiffrhythmInput
    output: SchemaDiffrhythmOutput
  }
  'fal-ai/elevenlabs/tts/multilingual-v2': {
    input: SchemaElevenlabsTtsMultilingualV2Input
    output: SchemaElevenlabsTtsMultilingualV2Output
  }
  'fal-ai/kokoro/hindi': {
    input: SchemaKokoroHindiInput
    output: SchemaKokoroHindiOutput
  }
  'fal-ai/kokoro/mandarin-chinese': {
    input: SchemaKokoroMandarinChineseInput
    output: SchemaKokoroMandarinChineseOutput
  }
  'fal-ai/kokoro/spanish': {
    input: SchemaKokoroSpanishInput
    output: SchemaKokoroSpanishOutput
  }
  'fal-ai/kokoro/brazilian-portuguese': {
    input: SchemaKokoroBrazilianPortugueseInput
    output: SchemaKokoroBrazilianPortugueseOutput
  }
  'fal-ai/kokoro/british-english': {
    input: SchemaKokoroBritishEnglishInput
    output: SchemaKokoroBritishEnglishOutput
  }
  'fal-ai/kokoro/french': {
    input: SchemaKokoroFrenchInput
    output: SchemaKokoroFrenchOutput
  }
  'fal-ai/kokoro/japanese': {
    input: SchemaKokoroJapaneseInput
    output: SchemaKokoroJapaneseOutput
  }
  'fal-ai/kokoro/american-english': {
    input: SchemaKokoroAmericanEnglishInput
    output: SchemaKokoroAmericanEnglishOutput
  }
  'fal-ai/zonos': {
    input: SchemaZonosInput
    output: SchemaZonosOutput
  }
  'fal-ai/kokoro/italian': {
    input: SchemaKokoroItalianInput
    output: SchemaKokoroItalianOutput
  }
  'fal-ai/yue': {
    input: SchemaYueInput
    output: SchemaYueOutput
  }
  'fal-ai/mmaudio-v2/text-to-audio': {
    input: SchemaMmaudioV2TextToAudioInput
    output: SchemaMmaudioV2TextToAudioOutput
  }
  'fal-ai/minimax-music': {
    input: SchemaMinimaxMusicInput
    output: SchemaMinimaxMusicOutput
  }
  'fal-ai/f5-tts': {
    input: SchemaF5TtsInput
    output: SchemaF5TtsOutput
  }
  'fal-ai/stable-audio': {
    input: SchemaStableAudioInput
    output: SchemaStableAudioOutput
  }
}

export const TextToAudioSchemaMap = {
  ['fal-ai/elevenlabs/music']: {
    input: zSchemaElevenlabsMusicInput,
    output: zSchemaElevenlabsMusicOutput,
  },
  ['fal-ai/minimax-music/v2']: {
    input: zSchemaMinimaxMusicV2Input,
    output: zSchemaMinimaxMusicV2Output,
  },
  ['beatoven/sound-effect-generation']: {
    input: zSchemaSoundEffectGenerationInput,
    output: zSchemaSoundEffectGenerationOutput,
  },
  ['beatoven/music-generation']: {
    input: zSchemaMusicGenerationInput,
    output: zSchemaMusicGenerationOutput,
  },
  ['fal-ai/minimax-music/v1.5']: {
    input: zSchemaMinimaxMusicV15Input,
    output: zSchemaMinimaxMusicV15Output,
  },
  ['fal-ai/stable-audio-25/text-to-audio']: {
    input: zSchemaStableAudio25TextToAudioInput,
    output: zSchemaStableAudio25TextToAudioOutput,
  },
  ['fal-ai/elevenlabs/sound-effects/v2']: {
    input: zSchemaElevenlabsSoundEffectsV2Input,
    output: zSchemaElevenlabsSoundEffectsV2Output,
  },
  ['sonauto/v2/inpaint']: {
    input: zSchemaV2InpaintInput,
    output: zSchemaV2InpaintOutput,
  },
  ['sonauto/v2/text-to-music']: {
    input: zSchemaV2TextToMusicInput,
    output: zSchemaV2TextToMusicOutput,
  },
  ['fal-ai/elevenlabs/tts/eleven-v3']: {
    input: zSchemaElevenlabsTtsElevenV3Input,
    output: zSchemaElevenlabsTtsElevenV3Output,
  },
  ['fal-ai/lyria2']: {
    input: zSchemaLyria2Input,
    output: zSchemaLyria2Output,
  },
  ['fal-ai/ace-step/prompt-to-audio']: {
    input: zSchemaAceStepPromptToAudioInput,
    output: zSchemaAceStepPromptToAudioOutput,
  },
  ['fal-ai/ace-step']: {
    input: zSchemaAceStepInput,
    output: zSchemaAceStepOutput,
  },
  ['cassetteai/sound-effects-generator']: {
    input: zSchemaSoundEffectsGeneratorInput,
    output: zSchemaSoundEffectsGeneratorOutput,
  },
  ['cassetteai/music-generator']: {
    input: zSchemaMusicGeneratorInput,
    output: zSchemaMusicGeneratorOutput,
  },
  ['fal-ai/csm-1b']: {
    input: zSchemaCsm1bInput,
    output: zSchemaCsm1bOutput,
  },
  ['fal-ai/diffrhythm']: {
    input: zSchemaDiffrhythmInput,
    output: zSchemaDiffrhythmOutput,
  },
  ['fal-ai/elevenlabs/tts/multilingual-v2']: {
    input: zSchemaElevenlabsTtsMultilingualV2Input,
    output: zSchemaElevenlabsTtsMultilingualV2Output,
  },
  ['fal-ai/kokoro/hindi']: {
    input: zSchemaKokoroHindiInput,
    output: zSchemaKokoroHindiOutput,
  },
  ['fal-ai/kokoro/mandarin-chinese']: {
    input: zSchemaKokoroMandarinChineseInput,
    output: zSchemaKokoroMandarinChineseOutput,
  },
  ['fal-ai/kokoro/spanish']: {
    input: zSchemaKokoroSpanishInput,
    output: zSchemaKokoroSpanishOutput,
  },
  ['fal-ai/kokoro/brazilian-portuguese']: {
    input: zSchemaKokoroBrazilianPortugueseInput,
    output: zSchemaKokoroBrazilianPortugueseOutput,
  },
  ['fal-ai/kokoro/british-english']: {
    input: zSchemaKokoroBritishEnglishInput,
    output: zSchemaKokoroBritishEnglishOutput,
  },
  ['fal-ai/kokoro/french']: {
    input: zSchemaKokoroFrenchInput,
    output: zSchemaKokoroFrenchOutput,
  },
  ['fal-ai/kokoro/japanese']: {
    input: zSchemaKokoroJapaneseInput,
    output: zSchemaKokoroJapaneseOutput,
  },
  ['fal-ai/kokoro/american-english']: {
    input: zSchemaKokoroAmericanEnglishInput,
    output: zSchemaKokoroAmericanEnglishOutput,
  },
  ['fal-ai/zonos']: {
    input: zSchemaZonosInput,
    output: zSchemaZonosOutput,
  },
  ['fal-ai/kokoro/italian']: {
    input: zSchemaKokoroItalianInput,
    output: zSchemaKokoroItalianOutput,
  },
  ['fal-ai/yue']: {
    input: zSchemaYueInput,
    output: zSchemaYueOutput,
  },
  ['fal-ai/mmaudio-v2/text-to-audio']: {
    input: zSchemaMmaudioV2TextToAudioInput,
    output: zSchemaMmaudioV2TextToAudioOutput,
  },
  ['fal-ai/minimax-music']: {
    input: zSchemaMinimaxMusicInput,
    output: zSchemaMinimaxMusicOutput,
  },
  ['fal-ai/f5-tts']: {
    input: zSchemaF5TtsInput,
    output: zSchemaF5TtsOutput,
  },
  ['fal-ai/stable-audio']: {
    input: zSchemaStableAudioInput,
    output: zSchemaStableAudioOutput,
  },
} as const

/** Union type of all text-to-audio model endpoint IDs */
export type TextToAudioModel = keyof TextToAudioEndpointMap

/** Get the input type for a specific text-to-audio model */
export type TextToAudioModelInput<T extends TextToAudioModel> = TextToAudioEndpointMap[T]['input']

/** Get the output type for a specific text-to-audio model */
export type TextToAudioModelOutput<T extends TextToAudioModel> = TextToAudioEndpointMap[T]['output']
