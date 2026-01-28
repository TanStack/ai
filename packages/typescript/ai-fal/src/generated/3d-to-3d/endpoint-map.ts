// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaHunyuanPartInput,
  zSchemaHunyuanPartOutput,
  zSchemaMeshyV5RemeshInput,
  zSchemaMeshyV5RemeshOutput,
  zSchemaMeshyV5RetextureInput,
  zSchemaMeshyV5RetextureOutput,
  zSchemaSam33dAlignInput,
  zSchemaSam33dAlignOutput,
  zSchemaUltrashapeInput,
  zSchemaUltrashapeOutput,
} from './zod.gen'

import type {
  SchemaHunyuanPartInput,
  SchemaHunyuanPartOutput,
  SchemaMeshyV5RemeshInput,
  SchemaMeshyV5RemeshOutput,
  SchemaMeshyV5RetextureInput,
  SchemaMeshyV5RetextureOutput,
  SchemaSam33dAlignInput,
  SchemaSam33dAlignOutput,
  SchemaUltrashapeInput,
  SchemaUltrashapeOutput,
} from './types.gen'

export type Gen3dTo3dEndpointMap = {
  'fal-ai/ultrashape': {
    input: SchemaUltrashapeInput
    output: SchemaUltrashapeOutput
  }
  'fal-ai/sam-3/3d-align': {
    input: SchemaSam33dAlignInput
    output: SchemaSam33dAlignOutput
  }
  'fal-ai/meshy/v5/retexture': {
    input: SchemaMeshyV5RetextureInput
    output: SchemaMeshyV5RetextureOutput
  }
  'fal-ai/meshy/v5/remesh': {
    input: SchemaMeshyV5RemeshInput
    output: SchemaMeshyV5RemeshOutput
  }
  'fal-ai/hunyuan-part': {
    input: SchemaHunyuanPartInput
    output: SchemaHunyuanPartOutput
  }
}

export const Gen3dTo3dSchemaMap = {
  ['fal-ai/ultrashape']: {
    input: zSchemaUltrashapeInput,
    output: zSchemaUltrashapeOutput,
  },
  ['fal-ai/sam-3/3d-align']: {
    input: zSchemaSam33dAlignInput,
    output: zSchemaSam33dAlignOutput,
  },
  ['fal-ai/meshy/v5/retexture']: {
    input: zSchemaMeshyV5RetextureInput,
    output: zSchemaMeshyV5RetextureOutput,
  },
  ['fal-ai/meshy/v5/remesh']: {
    input: zSchemaMeshyV5RemeshInput,
    output: zSchemaMeshyV5RemeshOutput,
  },
  ['fal-ai/hunyuan-part']: {
    input: zSchemaHunyuanPartInput,
    output: zSchemaHunyuanPartOutput,
  },
} as const

/** Union type of all 3d-to-3d model endpoint IDs */
export type Gen3dTo3dModel = keyof Gen3dTo3dEndpointMap

/** Get the input type for a specific 3d-to-3d model */
export type Gen3dTo3dModelInput<T extends Gen3dTo3dModel> = Gen3dTo3dEndpointMap[T]['input']

/** Get the output type for a specific 3d-to-3d model */
export type Gen3dTo3dModelOutput<T extends Gen3dTo3dModel> = Gen3dTo3dEndpointMap[T]['output']
