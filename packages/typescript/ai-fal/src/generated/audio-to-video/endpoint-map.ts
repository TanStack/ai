// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaAvatarsAudioToVideoInput,
  zSchemaAvatarsAudioToVideoOutput,
  zSchemaEchomimicV3Input,
  zSchemaEchomimicV3Output,
  zSchemaElevenlabsDubbingInput,
  zSchemaElevenlabsDubbingOutput,
  zSchemaLtx219bAudioToVideoInput,
  zSchemaLtx219bAudioToVideoLoraInput,
  zSchemaLtx219bAudioToVideoLoraOutput,
  zSchemaLtx219bAudioToVideoOutput,
  zSchemaLtx219bDistilledAudioToVideoInput,
  zSchemaLtx219bDistilledAudioToVideoOutput,
  zSchemaStableAvatarInput,
  zSchemaStableAvatarOutput,
  zSchemaWanV2214bSpeechToVideoInput,
  zSchemaWanV2214bSpeechToVideoOutput,
} from './zod.gen'

import type {
  SchemaAvatarsAudioToVideoInput,
  SchemaAvatarsAudioToVideoOutput,
  SchemaEchomimicV3Input,
  SchemaEchomimicV3Output,
  SchemaElevenlabsDubbingInput,
  SchemaElevenlabsDubbingOutput,
  SchemaLtx219bAudioToVideoInput,
  SchemaLtx219bAudioToVideoLoraInput,
  SchemaLtx219bAudioToVideoLoraOutput,
  SchemaLtx219bAudioToVideoOutput,
  SchemaLtx219bDistilledAudioToVideoInput,
  SchemaLtx219bDistilledAudioToVideoOutput,
  SchemaStableAvatarInput,
  SchemaStableAvatarOutput,
  SchemaWanV2214bSpeechToVideoInput,
  SchemaWanV2214bSpeechToVideoOutput,
} from './types.gen'

export type AudioToVideoEndpointMap = {
  'fal-ai/ltx-2-19b/audio-to-video/lora': {
    input: SchemaLtx219bAudioToVideoLoraInput
    output: SchemaLtx219bAudioToVideoLoraOutput
  }
  'fal-ai/ltx-2-19b/distilled/audio-to-video': {
    input: SchemaLtx219bDistilledAudioToVideoInput
    output: SchemaLtx219bDistilledAudioToVideoOutput
  }
  'fal-ai/ltx-2-19b/audio-to-video': {
    input: SchemaLtx219bAudioToVideoInput
    output: SchemaLtx219bAudioToVideoOutput
  }
  'fal-ai/elevenlabs/dubbing': {
    input: SchemaElevenlabsDubbingInput
    output: SchemaElevenlabsDubbingOutput
  }
  'argil/avatars/audio-to-video': {
    input: SchemaAvatarsAudioToVideoInput
    output: SchemaAvatarsAudioToVideoOutput
  }
  'fal-ai/wan/v2.2-14b/speech-to-video': {
    input: SchemaWanV2214bSpeechToVideoInput
    output: SchemaWanV2214bSpeechToVideoOutput
  }
  'fal-ai/stable-avatar': {
    input: SchemaStableAvatarInput
    output: SchemaStableAvatarOutput
  }
  'fal-ai/echomimic-v3': {
    input: SchemaEchomimicV3Input
    output: SchemaEchomimicV3Output
  }
  'veed/avatars/audio-to-video': {
    input: SchemaAvatarsAudioToVideoInput
    output: SchemaAvatarsAudioToVideoOutput
  }
}

export const AudioToVideoSchemaMap = {
  ['fal-ai/ltx-2-19b/audio-to-video/lora']: {
    input: zSchemaLtx219bAudioToVideoLoraInput,
    output: zSchemaLtx219bAudioToVideoLoraOutput,
  },
  ['fal-ai/ltx-2-19b/distilled/audio-to-video']: {
    input: zSchemaLtx219bDistilledAudioToVideoInput,
    output: zSchemaLtx219bDistilledAudioToVideoOutput,
  },
  ['fal-ai/ltx-2-19b/audio-to-video']: {
    input: zSchemaLtx219bAudioToVideoInput,
    output: zSchemaLtx219bAudioToVideoOutput,
  },
  ['fal-ai/elevenlabs/dubbing']: {
    input: zSchemaElevenlabsDubbingInput,
    output: zSchemaElevenlabsDubbingOutput,
  },
  ['argil/avatars/audio-to-video']: {
    input: zSchemaAvatarsAudioToVideoInput,
    output: zSchemaAvatarsAudioToVideoOutput,
  },
  ['fal-ai/wan/v2.2-14b/speech-to-video']: {
    input: zSchemaWanV2214bSpeechToVideoInput,
    output: zSchemaWanV2214bSpeechToVideoOutput,
  },
  ['fal-ai/stable-avatar']: {
    input: zSchemaStableAvatarInput,
    output: zSchemaStableAvatarOutput,
  },
  ['fal-ai/echomimic-v3']: {
    input: zSchemaEchomimicV3Input,
    output: zSchemaEchomimicV3Output,
  },
  ['veed/avatars/audio-to-video']: {
    input: zSchemaAvatarsAudioToVideoInput,
    output: zSchemaAvatarsAudioToVideoOutput,
  },
} as const

/** Union type of all audio-to-video model endpoint IDs */
export type AudioToVideoModel = keyof AudioToVideoEndpointMap

/** Get the input type for a specific audio-to-video model */
export type AudioToVideoModelInput<T extends AudioToVideoModel> = AudioToVideoEndpointMap[T]['input']

/** Get the output type for a specific audio-to-video model */
export type AudioToVideoModelOutput<T extends AudioToVideoModel> = AudioToVideoEndpointMap[T]['output']
