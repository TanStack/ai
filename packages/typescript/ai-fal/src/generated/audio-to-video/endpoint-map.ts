// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaAvatarsAudioToVideoInput,
  zSchemaAvatarsAudioToVideoOutput,
  zSchemaEchomimicV3Input,
  zSchemaEchomimicV3Output,
  zSchemaElevenlabsDubbingInput,
  zSchemaElevenlabsDubbingOutput,
  zSchemaLongcatMultiAvatarImageAudioToVideoInput,
  zSchemaLongcatMultiAvatarImageAudioToVideoOutput,
  zSchemaLongcatSingleAvatarAudioToVideoInput,
  zSchemaLongcatSingleAvatarAudioToVideoOutput,
  zSchemaLongcatSingleAvatarImageAudioToVideoInput,
  zSchemaLongcatSingleAvatarImageAudioToVideoOutput,
  zSchemaLtx219bAudioToVideoInput,
  zSchemaLtx219bAudioToVideoLoraInput,
  zSchemaLtx219bAudioToVideoLoraOutput,
  zSchemaLtx219bAudioToVideoOutput,
  zSchemaLtx219bDistilledAudioToVideoInput,
  zSchemaLtx219bDistilledAudioToVideoLoraInput,
  zSchemaLtx219bDistilledAudioToVideoLoraOutput,
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
  SchemaLongcatMultiAvatarImageAudioToVideoInput,
  SchemaLongcatMultiAvatarImageAudioToVideoOutput,
  SchemaLongcatSingleAvatarAudioToVideoInput,
  SchemaLongcatSingleAvatarAudioToVideoOutput,
  SchemaLongcatSingleAvatarImageAudioToVideoInput,
  SchemaLongcatSingleAvatarImageAudioToVideoOutput,
  SchemaLtx219bAudioToVideoInput,
  SchemaLtx219bAudioToVideoLoraInput,
  SchemaLtx219bAudioToVideoLoraOutput,
  SchemaLtx219bAudioToVideoOutput,
  SchemaLtx219bDistilledAudioToVideoInput,
  SchemaLtx219bDistilledAudioToVideoLoraInput,
  SchemaLtx219bDistilledAudioToVideoLoraOutput,
  SchemaLtx219bDistilledAudioToVideoOutput,
  SchemaStableAvatarInput,
  SchemaStableAvatarOutput,
  SchemaWanV2214bSpeechToVideoInput,
  SchemaWanV2214bSpeechToVideoOutput,
} from './types.gen'

import type { z } from 'zod'

export type AudioToVideoEndpointMap = {
  'fal-ai/ltx-2-19b/distilled/audio-to-video/lora': {
    input: SchemaLtx219bDistilledAudioToVideoLoraInput
    output: SchemaLtx219bDistilledAudioToVideoLoraOutput
  }
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
  'fal-ai/longcat-multi-avatar/image-audio-to-video': {
    input: SchemaLongcatMultiAvatarImageAudioToVideoInput
    output: SchemaLongcatMultiAvatarImageAudioToVideoOutput
  }
  'fal-ai/longcat-single-avatar/image-audio-to-video': {
    input: SchemaLongcatSingleAvatarImageAudioToVideoInput
    output: SchemaLongcatSingleAvatarImageAudioToVideoOutput
  }
  'fal-ai/longcat-single-avatar/audio-to-video': {
    input: SchemaLongcatSingleAvatarAudioToVideoInput
    output: SchemaLongcatSingleAvatarAudioToVideoOutput
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

/** Union type of all audio-to-video model endpoint IDs */
export type AudioToVideoModel = keyof AudioToVideoEndpointMap

export const AudioToVideoSchemaMap: Record<
  AudioToVideoModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ['fal-ai/ltx-2-19b/distilled/audio-to-video/lora']: {
    input: zSchemaLtx219bDistilledAudioToVideoLoraInput,
    output: zSchemaLtx219bDistilledAudioToVideoLoraOutput,
  },
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
  ['fal-ai/longcat-multi-avatar/image-audio-to-video']: {
    input: zSchemaLongcatMultiAvatarImageAudioToVideoInput,
    output: zSchemaLongcatMultiAvatarImageAudioToVideoOutput,
  },
  ['fal-ai/longcat-single-avatar/image-audio-to-video']: {
    input: zSchemaLongcatSingleAvatarImageAudioToVideoInput,
    output: zSchemaLongcatSingleAvatarImageAudioToVideoOutput,
  },
  ['fal-ai/longcat-single-avatar/audio-to-video']: {
    input: zSchemaLongcatSingleAvatarAudioToVideoInput,
    output: zSchemaLongcatSingleAvatarAudioToVideoOutput,
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

/** Get the input type for a specific audio-to-video model */
export type AudioToVideoModelInput<T extends AudioToVideoModel> =
  AudioToVideoEndpointMap[T]['input']

/** Get the output type for a specific audio-to-video model */
export type AudioToVideoModelOutput<T extends AudioToVideoModel> =
  AudioToVideoEndpointMap[T]['output']
