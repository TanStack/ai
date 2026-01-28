// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaAceStepAudioInpaintInput,
  zSchemaAceStepAudioInpaintOutput,
  zSchemaAceStepAudioOutpaintInput,
  zSchemaAceStepAudioOutpaintOutput,
  zSchemaAceStepAudioToAudioInput,
  zSchemaAceStepAudioToAudioOutput,
  zSchemaAudioUnderstandingInput,
  zSchemaAudioUnderstandingOutput,
  zSchemaDeepfilternet3Input,
  zSchemaDeepfilternet3Output,
  zSchemaDemucsInput,
  zSchemaDemucsOutput,
  zSchemaDiaTtsVoiceCloneInput,
  zSchemaDiaTtsVoiceCloneOutput,
  zSchemaElevenlabsAudioIsolationInput,
  zSchemaElevenlabsAudioIsolationOutput,
  zSchemaElevenlabsVoiceChangerInput,
  zSchemaElevenlabsVoiceChangerOutput,
  zSchemaFfmpegApiMergeAudiosInput,
  zSchemaFfmpegApiMergeAudiosOutput,
  zSchemaKlingVideoCreateVoiceInput,
  zSchemaKlingVideoCreateVoiceOutput,
  zSchemaNovaSrInput,
  zSchemaNovaSrOutput,
  zSchemaSamAudioSeparateInput,
  zSchemaSamAudioSeparateOutput,
  zSchemaSamAudioSpanSeparateInput,
  zSchemaSamAudioSpanSeparateOutput,
  zSchemaStableAudio25AudioToAudioInput,
  zSchemaStableAudio25AudioToAudioOutput,
  zSchemaStableAudio25InpaintInput,
  zSchemaStableAudio25InpaintOutput,
  zSchemaV2ExtendInput,
  zSchemaV2ExtendOutput,
} from './zod.gen'

import type {
  SchemaAceStepAudioInpaintInput,
  SchemaAceStepAudioInpaintOutput,
  SchemaAceStepAudioOutpaintInput,
  SchemaAceStepAudioOutpaintOutput,
  SchemaAceStepAudioToAudioInput,
  SchemaAceStepAudioToAudioOutput,
  SchemaAudioUnderstandingInput,
  SchemaAudioUnderstandingOutput,
  SchemaDeepfilternet3Input,
  SchemaDeepfilternet3Output,
  SchemaDemucsInput,
  SchemaDemucsOutput,
  SchemaDiaTtsVoiceCloneInput,
  SchemaDiaTtsVoiceCloneOutput,
  SchemaElevenlabsAudioIsolationInput,
  SchemaElevenlabsAudioIsolationOutput,
  SchemaElevenlabsVoiceChangerInput,
  SchemaElevenlabsVoiceChangerOutput,
  SchemaFfmpegApiMergeAudiosInput,
  SchemaFfmpegApiMergeAudiosOutput,
  SchemaKlingVideoCreateVoiceInput,
  SchemaKlingVideoCreateVoiceOutput,
  SchemaNovaSrInput,
  SchemaNovaSrOutput,
  SchemaSamAudioSeparateInput,
  SchemaSamAudioSeparateOutput,
  SchemaSamAudioSpanSeparateInput,
  SchemaSamAudioSpanSeparateOutput,
  SchemaStableAudio25AudioToAudioInput,
  SchemaStableAudio25AudioToAudioOutput,
  SchemaStableAudio25InpaintInput,
  SchemaStableAudio25InpaintOutput,
  SchemaV2ExtendInput,
  SchemaV2ExtendOutput,
} from './types.gen'

export type AudioToAudioEndpointMap = {
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
}

export const AudioToAudioSchemaMap = {
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
} as const

/** Union type of all audio-to-audio model endpoint IDs */
export type AudioToAudioModel = keyof AudioToAudioEndpointMap

/** Get the input type for a specific audio-to-audio model */
export type AudioToAudioModelInput<T extends AudioToAudioModel> = AudioToAudioEndpointMap[T]['input']

/** Get the output type for a specific audio-to-audio model */
export type AudioToAudioModelOutput<T extends AudioToAudioModel> = AudioToAudioEndpointMap[T]['output']
