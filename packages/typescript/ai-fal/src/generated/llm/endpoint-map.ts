// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaQwen3GuardInput,
  zSchemaQwen3GuardOutput,
  zSchemaRouterInput,
  zSchemaRouterOpenaiV1ChatCompletionsInput,
  zSchemaRouterOpenaiV1ChatCompletionsOutput,
  zSchemaRouterOpenaiV1EmbeddingsInput,
  zSchemaRouterOpenaiV1EmbeddingsOutput,
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
  SchemaRouterOpenaiV1ChatCompletionsInput,
  SchemaRouterOpenaiV1ChatCompletionsOutput,
  SchemaRouterOpenaiV1EmbeddingsInput,
  SchemaRouterOpenaiV1EmbeddingsOutput,
  SchemaRouterOpenaiV1ResponsesInput,
  SchemaRouterOpenaiV1ResponsesOutput,
  SchemaRouterOutput,
  SchemaVideoPromptGeneratorInput,
  SchemaVideoPromptGeneratorOutput,
} from './types.gen'

import type { z } from 'zod'

export type LlmEndpointMap = {
  'openrouter/router/openai/v1/responses': {
    input: SchemaRouterOpenaiV1ResponsesInput
    output: SchemaRouterOpenaiV1ResponsesOutput
  }
  'openrouter/router/openai/v1/embeddings': {
    input: SchemaRouterOpenaiV1EmbeddingsInput
    output: SchemaRouterOpenaiV1EmbeddingsOutput
  }
  'openrouter/router': {
    input: SchemaRouterInput
    output: SchemaRouterOutput
  }
  'openrouter/router/openai/v1/chat/completions': {
    input: SchemaRouterOpenaiV1ChatCompletionsInput
    output: SchemaRouterOpenaiV1ChatCompletionsOutput
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

/** Union type of all llm model endpoint IDs */
export type LlmModel = keyof LlmEndpointMap

export const LlmSchemaMap: Record<
  LlmModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ['openrouter/router/openai/v1/responses']: {
    input: zSchemaRouterOpenaiV1ResponsesInput,
    output: zSchemaRouterOpenaiV1ResponsesOutput,
  },
  ['openrouter/router/openai/v1/embeddings']: {
    input: zSchemaRouterOpenaiV1EmbeddingsInput,
    output: zSchemaRouterOpenaiV1EmbeddingsOutput,
  },
  ['openrouter/router']: {
    input: zSchemaRouterInput,
    output: zSchemaRouterOutput,
  },
  ['openrouter/router/openai/v1/chat/completions']: {
    input: zSchemaRouterOpenaiV1ChatCompletionsInput,
    output: zSchemaRouterOpenaiV1ChatCompletionsOutput,
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

/** Get the input type for a specific llm model */
export type LlmModelInput<T extends LlmModel> = LlmEndpointMap[T]['input']

/** Get the output type for a specific llm model */
export type LlmModelOutput<T extends LlmModel> = LlmEndpointMap[T]['output']
