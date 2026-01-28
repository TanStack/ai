// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaQwen3TtsCloneVoice06bInput,
  zSchemaQwen3TtsCloneVoice06bOutput,
  zSchemaQwen3TtsCloneVoice17bInput,
  zSchemaQwen3TtsCloneVoice17bOutput,
  zSchemaRouterAudioInput,
  zSchemaRouterAudioOutput,
  zSchemaWorkflowUtilitiesInterleaveVideoInput,
  zSchemaWorkflowUtilitiesInterleaveVideoOutput,
} from './zod.gen'

import type {
  SchemaQwen3TtsCloneVoice06bInput,
  SchemaQwen3TtsCloneVoice06bOutput,
  SchemaQwen3TtsCloneVoice17bInput,
  SchemaQwen3TtsCloneVoice17bOutput,
  SchemaRouterAudioInput,
  SchemaRouterAudioOutput,
  SchemaWorkflowUtilitiesInterleaveVideoInput,
  SchemaWorkflowUtilitiesInterleaveVideoOutput,
} from './types.gen'

export type UnknownEndpointMap = {
  'fal-ai/workflow-utilities/interleave-video': {
    input: SchemaWorkflowUtilitiesInterleaveVideoInput
    output: SchemaWorkflowUtilitiesInterleaveVideoOutput
  }
  'fal-ai/qwen-3-tts/clone-voice/1.7b': {
    input: SchemaQwen3TtsCloneVoice17bInput
    output: SchemaQwen3TtsCloneVoice17bOutput
  }
  'fal-ai/qwen-3-tts/clone-voice/0.6b': {
    input: SchemaQwen3TtsCloneVoice06bInput
    output: SchemaQwen3TtsCloneVoice06bOutput
  }
  'openrouter/router/audio': {
    input: SchemaRouterAudioInput
    output: SchemaRouterAudioOutput
  }
}

export const UnknownSchemaMap = {
  ['fal-ai/workflow-utilities/interleave-video']: {
    input: zSchemaWorkflowUtilitiesInterleaveVideoInput,
    output: zSchemaWorkflowUtilitiesInterleaveVideoOutput,
  },
  ['fal-ai/qwen-3-tts/clone-voice/1.7b']: {
    input: zSchemaQwen3TtsCloneVoice17bInput,
    output: zSchemaQwen3TtsCloneVoice17bOutput,
  },
  ['fal-ai/qwen-3-tts/clone-voice/0.6b']: {
    input: zSchemaQwen3TtsCloneVoice06bInput,
    output: zSchemaQwen3TtsCloneVoice06bOutput,
  },
  ['openrouter/router/audio']: {
    input: zSchemaRouterAudioInput,
    output: zSchemaRouterAudioOutput,
  },
} as const

/** Union type of all unknown model endpoint IDs */
export type UnknownModel = keyof UnknownEndpointMap

/** Get the input type for a specific unknown model */
export type UnknownModelInput<T extends UnknownModel> = UnknownEndpointMap[T]['input']

/** Get the output type for a specific unknown model */
export type UnknownModelOutput<T extends UnknownModel> = UnknownEndpointMap[T]['output']
