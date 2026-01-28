// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaHunyuan3dV3TextTo3dInput,
  zSchemaHunyuan3dV3TextTo3dOutput,
  zSchemaHunyuanMotionFastInput,
  zSchemaHunyuanMotionFastOutput,
  zSchemaHunyuanMotionInput,
  zSchemaHunyuanMotionOutput,
  zSchemaMeshyV6PreviewTextTo3dInput,
  zSchemaMeshyV6PreviewTextTo3dOutput,
} from './zod.gen'

import type {
  SchemaHunyuan3dV3TextTo3dInput,
  SchemaHunyuan3dV3TextTo3dOutput,
  SchemaHunyuanMotionFastInput,
  SchemaHunyuanMotionFastOutput,
  SchemaHunyuanMotionInput,
  SchemaHunyuanMotionOutput,
  SchemaMeshyV6PreviewTextTo3dInput,
  SchemaMeshyV6PreviewTextTo3dOutput,
} from './types.gen'

import type { z } from 'zod'

export type TextTo3dEndpointMap = {
  'fal-ai/hunyuan-motion/fast': {
    input: SchemaHunyuanMotionFastInput
    output: SchemaHunyuanMotionFastOutput
  }
  'fal-ai/hunyuan-motion': {
    input: SchemaHunyuanMotionInput
    output: SchemaHunyuanMotionOutput
  }
  'fal-ai/hunyuan3d-v3/text-to-3d': {
    input: SchemaHunyuan3dV3TextTo3dInput
    output: SchemaHunyuan3dV3TextTo3dOutput
  }
  'fal-ai/meshy/v6-preview/text-to-3d': {
    input: SchemaMeshyV6PreviewTextTo3dInput
    output: SchemaMeshyV6PreviewTextTo3dOutput
  }
}

/** Union type of all text-to-3d model endpoint IDs */
export type TextTo3dModel = keyof TextTo3dEndpointMap

export const TextTo3dSchemaMap: Record<
  TextTo3dModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ['fal-ai/hunyuan-motion/fast']: {
    input: zSchemaHunyuanMotionFastInput,
    output: zSchemaHunyuanMotionFastOutput,
  },
  ['fal-ai/hunyuan-motion']: {
    input: zSchemaHunyuanMotionInput,
    output: zSchemaHunyuanMotionOutput,
  },
  ['fal-ai/hunyuan3d-v3/text-to-3d']: {
    input: zSchemaHunyuan3dV3TextTo3dInput,
    output: zSchemaHunyuan3dV3TextTo3dOutput,
  },
  ['fal-ai/meshy/v6-preview/text-to-3d']: {
    input: zSchemaMeshyV6PreviewTextTo3dInput,
    output: zSchemaMeshyV6PreviewTextTo3dOutput,
  },
} as const

/** Get the input type for a specific text-to-3d model */
export type TextTo3dModelInput<T extends TextTo3dModel> =
  TextTo3dEndpointMap[T]['input']

/** Get the output type for a specific text-to-3d model */
export type TextTo3dModelOutput<T extends TextTo3dModel> =
  TextTo3dEndpointMap[T]['output']
