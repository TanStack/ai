// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaAceStepAudioInpaintInput,
  zSchemaAceStepAudioInpaintOutput,
  zSchemaAceStepAudioOutpaintInput,
  zSchemaAceStepAudioOutpaintOutput,
  zSchemaAceStepAudioToAudioInput,
  zSchemaAceStepAudioToAudioOutput,
  zSchemaAceStepInput,
  zSchemaAceStepOutput,
  zSchemaAceStepPromptToAudioInput,
  zSchemaAceStepPromptToAudioOutput,
  zSchemaAudioUnderstandingInput,
  zSchemaAudioUnderstandingOutput,
  zSchemaCsm1bInput,
  zSchemaCsm1bOutput,
  zSchemaDeepfilternet3Input,
  zSchemaDeepfilternet3Output,
  zSchemaDemucsInput,
  zSchemaDemucsOutput,
  zSchemaDiaTtsVoiceCloneInput,
  zSchemaDiaTtsVoiceCloneOutput,
  zSchemaDiffrhythmInput,
  zSchemaDiffrhythmOutput,
  zSchemaElevenlabsAudioIsolationInput,
  zSchemaElevenlabsAudioIsolationOutput,
  zSchemaElevenlabsMusicInput,
  zSchemaElevenlabsMusicOutput,
  zSchemaElevenlabsSoundEffectsV2Input,
  zSchemaElevenlabsSoundEffectsV2Output,
  zSchemaElevenlabsTextToDialogueElevenV3Input,
  zSchemaElevenlabsTextToDialogueElevenV3Output,
  zSchemaElevenlabsTtsElevenV3Input,
  zSchemaElevenlabsTtsElevenV3Output,
  zSchemaElevenlabsTtsMultilingualV2Input,
  zSchemaElevenlabsTtsMultilingualV2Output,
  zSchemaElevenlabsVoiceChangerInput,
  zSchemaElevenlabsVoiceChangerOutput,
  zSchemaF5TtsInput,
  zSchemaF5TtsOutput,
  zSchemaFfmpegApiMergeAudiosInput,
  zSchemaFfmpegApiMergeAudiosOutput,
  zSchemaKlingVideoCreateVoiceInput,
  zSchemaKlingVideoCreateVoiceOutput,
  zSchemaKlingVideoVideoToAudioInput,
  zSchemaKlingVideoVideoToAudioOutput,
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
  zSchemaNovaSrInput,
  zSchemaNovaSrOutput,
  zSchemaSamAudioSeparateInput,
  zSchemaSamAudioSeparateOutput,
  zSchemaSamAudioSpanSeparateInput,
  zSchemaSamAudioSpanSeparateOutput,
  zSchemaSamAudioVisualSeparateInput,
  zSchemaSamAudioVisualSeparateOutput,
  zSchemaSfxV15VideoToAudioInput,
  zSchemaSfxV15VideoToAudioOutput,
  zSchemaSfxV1VideoToAudioInput,
  zSchemaSfxV1VideoToAudioOutput,
  zSchemaSoundEffectGenerationInput,
  zSchemaSoundEffectGenerationOutput,
  zSchemaSoundEffectsGeneratorInput,
  zSchemaSoundEffectsGeneratorOutput,
  zSchemaStableAudio25AudioToAudioInput,
  zSchemaStableAudio25AudioToAudioOutput,
  zSchemaStableAudio25InpaintInput,
  zSchemaStableAudio25InpaintOutput,
  zSchemaStableAudio25TextToAudioInput,
  zSchemaStableAudio25TextToAudioOutput,
  zSchemaStableAudioInput,
  zSchemaStableAudioOutput,
  zSchemaV2ExtendInput,
  zSchemaV2ExtendOutput,
  zSchemaV2InpaintInput,
  zSchemaV2InpaintOutput,
  zSchemaV2TextToMusicInput,
  zSchemaV2TextToMusicOutput,
  zSchemaYueInput,
  zSchemaYueOutput,
  zSchemaZonosInput,
  zSchemaZonosOutput,
} from './zod.gen'
import type { z } from 'zod'

import type {
  SchemaAceStepAudioInpaintInput,
  SchemaAceStepAudioInpaintOutput,
  SchemaAceStepAudioOutpaintInput,
  SchemaAceStepAudioOutpaintOutput,
  SchemaAceStepAudioToAudioInput,
  SchemaAceStepAudioToAudioOutput,
  SchemaAceStepInput,
  SchemaAceStepOutput,
  SchemaAceStepPromptToAudioInput,
  SchemaAceStepPromptToAudioOutput,
  SchemaAudioUnderstandingInput,
  SchemaAudioUnderstandingOutput,
  SchemaCsm1bInput,
  SchemaCsm1bOutput,
  SchemaDeepfilternet3Input,
  SchemaDeepfilternet3Output,
  SchemaDemucsInput,
  SchemaDemucsOutput,
  SchemaDiaTtsVoiceCloneInput,
  SchemaDiaTtsVoiceCloneOutput,
  SchemaDiffrhythmInput,
  SchemaDiffrhythmOutput,
  SchemaElevenlabsAudioIsolationInput,
  SchemaElevenlabsAudioIsolationOutput,
  SchemaElevenlabsMusicInput,
  SchemaElevenlabsMusicOutput,
  SchemaElevenlabsSoundEffectsV2Input,
  SchemaElevenlabsSoundEffectsV2Output,
  SchemaElevenlabsTextToDialogueElevenV3Input,
  SchemaElevenlabsTextToDialogueElevenV3Output,
  SchemaElevenlabsTtsElevenV3Input,
  SchemaElevenlabsTtsElevenV3Output,
  SchemaElevenlabsTtsMultilingualV2Input,
  SchemaElevenlabsTtsMultilingualV2Output,
  SchemaElevenlabsVoiceChangerInput,
  SchemaElevenlabsVoiceChangerOutput,
  SchemaF5TtsInput,
  SchemaF5TtsOutput,
  SchemaFfmpegApiMergeAudiosInput,
  SchemaFfmpegApiMergeAudiosOutput,
  SchemaKlingVideoCreateVoiceInput,
  SchemaKlingVideoCreateVoiceOutput,
  SchemaKlingVideoVideoToAudioInput,
  SchemaKlingVideoVideoToAudioOutput,
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
  SchemaNovaSrInput,
  SchemaNovaSrOutput,
  SchemaSamAudioSeparateInput,
  SchemaSamAudioSeparateOutput,
  SchemaSamAudioSpanSeparateInput,
  SchemaSamAudioSpanSeparateOutput,
  SchemaSamAudioVisualSeparateInput,
  SchemaSamAudioVisualSeparateOutput,
  SchemaSfxV15VideoToAudioInput,
  SchemaSfxV15VideoToAudioOutput,
  SchemaSfxV1VideoToAudioInput,
  SchemaSfxV1VideoToAudioOutput,
  SchemaSoundEffectGenerationInput,
  SchemaSoundEffectGenerationOutput,
  SchemaSoundEffectsGeneratorInput,
  SchemaSoundEffectsGeneratorOutput,
  SchemaStableAudio25AudioToAudioInput,
  SchemaStableAudio25AudioToAudioOutput,
  SchemaStableAudio25InpaintInput,
  SchemaStableAudio25InpaintOutput,
  SchemaStableAudio25TextToAudioInput,
  SchemaStableAudio25TextToAudioOutput,
  SchemaStableAudioInput,
  SchemaStableAudioOutput,
  SchemaV2ExtendInput,
  SchemaV2ExtendOutput,
  SchemaV2InpaintInput,
  SchemaV2InpaintOutput,
  SchemaV2TextToMusicInput,
  SchemaV2TextToMusicOutput,
  SchemaYueInput,
  SchemaYueOutput,
  SchemaZonosInput,
  SchemaZonosOutput,
} from './types.gen'

export type AudioEndpointMap = {
  'fal-ai/elevenlabs/voice-changer': {
    input: SchemaElevenlabsVoiceChangerInput
    output: SchemaElevenlabsVoiceChangerOutput
  }
  'fal-ai/nova-sr': {
    input: SchemaNovaSrInput
    output: SchemaNovaSrOutput
  }
  'fal-ai/deepfilternet3': {
    input: SchemaDeepfilternet3Input
    output: SchemaDeepfilternet3Output
  }
  'fal-ai/sam-audio/separate': {
    input: SchemaSamAudioSeparateInput
    output: SchemaSamAudioSeparateOutput
  }
  'fal-ai/sam-audio/span-separate': {
    input: SchemaSamAudioSpanSeparateInput
    output: SchemaSamAudioSpanSeparateOutput
  }
  'fal-ai/ffmpeg-api/merge-audios': {
    input: SchemaFfmpegApiMergeAudiosInput
    output: SchemaFfmpegApiMergeAudiosOutput
  }
  'fal-ai/kling-video/create-voice': {
    input: SchemaKlingVideoCreateVoiceInput
    output: SchemaKlingVideoCreateVoiceOutput
  }
  'fal-ai/demucs': {
    input: SchemaDemucsInput
    output: SchemaDemucsOutput
  }
  'fal-ai/audio-understanding': {
    input: SchemaAudioUnderstandingInput
    output: SchemaAudioUnderstandingOutput
  }
  'fal-ai/stable-audio-25/audio-to-audio': {
    input: SchemaStableAudio25AudioToAudioInput
    output: SchemaStableAudio25AudioToAudioOutput
  }
  'fal-ai/stable-audio-25/inpaint': {
    input: SchemaStableAudio25InpaintInput
    output: SchemaStableAudio25InpaintOutput
  }
  'sonauto/v2/extend': {
    input: SchemaV2ExtendInput
    output: SchemaV2ExtendOutput
  }
  'fal-ai/ace-step/audio-outpaint': {
    input: SchemaAceStepAudioOutpaintInput
    output: SchemaAceStepAudioOutpaintOutput
  }
  'fal-ai/ace-step/audio-inpaint': {
    input: SchemaAceStepAudioInpaintInput
    output: SchemaAceStepAudioInpaintOutput
  }
  'fal-ai/ace-step/audio-to-audio': {
    input: SchemaAceStepAudioToAudioInput
    output: SchemaAceStepAudioToAudioOutput
  }
  'fal-ai/dia-tts/voice-clone': {
    input: SchemaDiaTtsVoiceCloneInput
    output: SchemaDiaTtsVoiceCloneOutput
  }
  'fal-ai/elevenlabs/audio-isolation': {
    input: SchemaElevenlabsAudioIsolationInput
    output: SchemaElevenlabsAudioIsolationOutput
  }
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
  'fal-ai/elevenlabs/text-to-dialogue/eleven-v3': {
    input: SchemaElevenlabsTextToDialogueElevenV3Input
    output: SchemaElevenlabsTextToDialogueElevenV3Output
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
  'fal-ai/sam-audio/visual-separate': {
    input: SchemaSamAudioVisualSeparateInput
    output: SchemaSamAudioVisualSeparateOutput
  }
  'mirelo-ai/sfx-v1.5/video-to-audio': {
    input: SchemaSfxV15VideoToAudioInput
    output: SchemaSfxV15VideoToAudioOutput
  }
  'fal-ai/kling-video/video-to-audio': {
    input: SchemaKlingVideoVideoToAudioInput
    output: SchemaKlingVideoVideoToAudioOutput
  }
  'mirelo-ai/sfx-v1/video-to-audio': {
    input: SchemaSfxV1VideoToAudioInput
    output: SchemaSfxV1VideoToAudioOutput
  }
}

/** Union type of all audio model endpoint IDs */
export type AudioModel = keyof AudioEndpointMap

export const AudioSchemaMap: Record<
  AudioModel,
  {
    input: z.ZodSchema<AudioModelInput<AudioModel>>
    output: z.ZodSchema<AudioModelOutput<AudioModel>>
  }
> = {
  ['fal-ai/elevenlabs/voice-changer']: {
    input: zSchemaElevenlabsVoiceChangerInput,
    output: zSchemaElevenlabsVoiceChangerOutput,
  },
  ['fal-ai/nova-sr']: {
    input: zSchemaNovaSrInput,
    output: zSchemaNovaSrOutput,
  },
  ['fal-ai/deepfilternet3']: {
    input: zSchemaDeepfilternet3Input,
    output: zSchemaDeepfilternet3Output,
  },
  ['fal-ai/sam-audio/separate']: {
    input: zSchemaSamAudioSeparateInput,
    output: zSchemaSamAudioSeparateOutput,
  },
  ['fal-ai/sam-audio/span-separate']: {
    input: zSchemaSamAudioSpanSeparateInput,
    output: zSchemaSamAudioSpanSeparateOutput,
  },
  ['fal-ai/ffmpeg-api/merge-audios']: {
    input: zSchemaFfmpegApiMergeAudiosInput,
    output: zSchemaFfmpegApiMergeAudiosOutput,
  },
  ['fal-ai/kling-video/create-voice']: {
    input: zSchemaKlingVideoCreateVoiceInput,
    output: zSchemaKlingVideoCreateVoiceOutput,
  },
  ['fal-ai/demucs']: {
    input: zSchemaDemucsInput,
    output: zSchemaDemucsOutput,
  },
  ['fal-ai/audio-understanding']: {
    input: zSchemaAudioUnderstandingInput,
    output: zSchemaAudioUnderstandingOutput,
  },
  ['fal-ai/stable-audio-25/audio-to-audio']: {
    input: zSchemaStableAudio25AudioToAudioInput,
    output: zSchemaStableAudio25AudioToAudioOutput,
  },
  ['fal-ai/stable-audio-25/inpaint']: {
    input: zSchemaStableAudio25InpaintInput,
    output: zSchemaStableAudio25InpaintOutput,
  },
  ['sonauto/v2/extend']: {
    input: zSchemaV2ExtendInput,
    output: zSchemaV2ExtendOutput,
  },
  ['fal-ai/ace-step/audio-outpaint']: {
    input: zSchemaAceStepAudioOutpaintInput,
    output: zSchemaAceStepAudioOutpaintOutput,
  },
  ['fal-ai/ace-step/audio-inpaint']: {
    input: zSchemaAceStepAudioInpaintInput,
    output: zSchemaAceStepAudioInpaintOutput,
  },
  ['fal-ai/ace-step/audio-to-audio']: {
    input: zSchemaAceStepAudioToAudioInput,
    output: zSchemaAceStepAudioToAudioOutput,
  },
  ['fal-ai/dia-tts/voice-clone']: {
    input: zSchemaDiaTtsVoiceCloneInput,
    output: zSchemaDiaTtsVoiceCloneOutput,
  },
  ['fal-ai/elevenlabs/audio-isolation']: {
    input: zSchemaElevenlabsAudioIsolationInput,
    output: zSchemaElevenlabsAudioIsolationOutput,
  },
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
  ['fal-ai/elevenlabs/text-to-dialogue/eleven-v3']: {
    input: zSchemaElevenlabsTextToDialogueElevenV3Input,
    output: zSchemaElevenlabsTextToDialogueElevenV3Output,
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
  ['fal-ai/sam-audio/visual-separate']: {
    input: zSchemaSamAudioVisualSeparateInput,
    output: zSchemaSamAudioVisualSeparateOutput,
  },
  ['mirelo-ai/sfx-v1.5/video-to-audio']: {
    input: zSchemaSfxV15VideoToAudioInput,
    output: zSchemaSfxV15VideoToAudioOutput,
  },
  ['fal-ai/kling-video/video-to-audio']: {
    input: zSchemaKlingVideoVideoToAudioInput,
    output: zSchemaKlingVideoVideoToAudioOutput,
  },
  ['mirelo-ai/sfx-v1/video-to-audio']: {
    input: zSchemaSfxV1VideoToAudioInput,
    output: zSchemaSfxV1VideoToAudioOutput,
  },
}

/** Get the input type for a specific audio model */
export type AudioModelInput<T extends AudioModel> = AudioEndpointMap[T]['input']

/** Get the output type for a specific audio model */
export type AudioModelOutput<T extends AudioModel> =
  AudioEndpointMap[T]['output']
