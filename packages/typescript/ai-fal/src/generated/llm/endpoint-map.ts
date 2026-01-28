// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaQwen3GuardInput,
  zSchemaQwen3GuardOutput,
  zSchemaRouterInput,
  zSchemaRouterOpenaiV1ResponsesInput,
  zSchemaRouterOpenaiV1ResponsesOutput,
  zSchemaRouterOutput,
  zSchemaVideoPromptGeneratorInput,
  zSchemaVideoPromptGeneratorOutput,
} from './zod.gen'

import type {
  SchemaQwen3GuardInput,
  SchemaQwen3GuardOutput,
  SchemaRouterInput,
  SchemaRouterOpenaiV1ResponsesInput,
  SchemaRouterOpenaiV1ResponsesOutput,
  SchemaRouterOutput,
  SchemaVideoPromptGeneratorInput,
  SchemaVideoPromptGeneratorOutput,
} from './types.gen'

export type LlmEndpointMap = {
  'openrouter/router/openai/v1/responses': {
    input: SchemaRouterOpenaiV1ResponsesInput
    output: SchemaRouterOpenaiV1ResponsesOutput
  }
  'openrouter/router': {
    input: SchemaRouterInput
    output: SchemaRouterOutput
  }
  'fal-ai/qwen-3-guard': {
    input: SchemaQwen3GuardInput
    output: SchemaQwen3GuardOutput
  }
  'fal-ai/video-prompt-generator': {
    input: SchemaVideoPromptGeneratorInput
    output: SchemaVideoPromptGeneratorOutput
  }
}

export const LlmSchemaMap = {
  ['openrouter/router/openai/v1/responses']: {
    input: zSchemaRouterOpenaiV1ResponsesInput,
    output: zSchemaRouterOpenaiV1ResponsesOutput,
  },
  ['openrouter/router']: {
    input: zSchemaRouterInput,
    output: zSchemaRouterOutput,
  },
  ['fal-ai/qwen-3-guard']: {
    input: zSchemaQwen3GuardInput,
    output: zSchemaQwen3GuardOutput,
  },
  ['fal-ai/video-prompt-generator']: {
    input: zSchemaVideoPromptGeneratorInput,
    output: zSchemaVideoPromptGeneratorOutput,
  },
} as const

/** Union type of all llm model endpoint IDs */
export type LlmModel = keyof LlmEndpointMap

/** Get the input type for a specific llm model */
export type LlmModelInput<T extends LlmModel> = LlmEndpointMap[T]['input']

/** Get the output type for a specific llm model */
export type LlmModelOutput<T extends LlmModel> = LlmEndpointMap[T]['output']
