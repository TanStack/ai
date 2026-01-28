// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaRouterVideoEnterpriseInput,
  zSchemaRouterVideoEnterpriseOutput,
  zSchemaRouterVideoInput,
  zSchemaRouterVideoOutput,
} from './zod.gen'

import type {
  SchemaRouterVideoEnterpriseInput,
  SchemaRouterVideoEnterpriseOutput,
  SchemaRouterVideoInput,
  SchemaRouterVideoOutput,
} from './types.gen'

import type { z } from 'zod'

export type VideoToTextEndpointMap = {
  'openrouter/router/video/enterprise': {
    input: SchemaRouterVideoEnterpriseInput
    output: SchemaRouterVideoEnterpriseOutput
  }
  'openrouter/router/video': {
    input: SchemaRouterVideoInput
    output: SchemaRouterVideoOutput
  }
}

/** Union type of all video-to-text model endpoint IDs */
export type VideoToTextModel = keyof VideoToTextEndpointMap

export const VideoToTextSchemaMap: Record<
  VideoToTextModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ['openrouter/router/video/enterprise']: {
    input: zSchemaRouterVideoEnterpriseInput,
    output: zSchemaRouterVideoEnterpriseOutput,
  },
  ['openrouter/router/video']: {
    input: zSchemaRouterVideoInput,
    output: zSchemaRouterVideoOutput,
  },
} as const

/** Get the input type for a specific video-to-text model */
export type VideoToTextModelInput<T extends VideoToTextModel> =
  VideoToTextEndpointMap[T]['input']

/** Get the output type for a specific video-to-text model */
export type VideoToTextModelOutput<T extends VideoToTextModel> =
  VideoToTextEndpointMap[T]['output']
