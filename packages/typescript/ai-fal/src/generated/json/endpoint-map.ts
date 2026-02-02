// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaBagelUnderstandInput,
  zSchemaBagelUnderstandOutput,
  zSchemaFfmpegApiLoudnormInput,
  zSchemaFfmpegApiLoudnormOutput,
  zSchemaFfmpegApiMetadataInput,
  zSchemaFfmpegApiMetadataOutput,
  zSchemaFfmpegApiWaveformInput,
  zSchemaFfmpegApiWaveformOutput,
  zSchemaFiboEditEditStructuredInstructionInput,
  zSchemaFiboEditEditStructuredInstructionOutput,
  zSchemaFiboGenerateStructuredPromptInput,
  zSchemaFiboGenerateStructuredPromptOutput,
  zSchemaFiboLiteGenerateStructuredPromptInput,
  zSchemaFiboLiteGenerateStructuredPromptLiteInput,
  zSchemaFiboLiteGenerateStructuredPromptLiteOutput,
  zSchemaFiboLiteGenerateStructuredPromptOutput,
} from './zod.gen'
import type { z } from 'zod'

import type {
  SchemaBagelUnderstandInput,
  SchemaBagelUnderstandOutput,
  SchemaFfmpegApiLoudnormInput,
  SchemaFfmpegApiLoudnormOutput,
  SchemaFfmpegApiMetadataInput,
  SchemaFfmpegApiMetadataOutput,
  SchemaFfmpegApiWaveformInput,
  SchemaFfmpegApiWaveformOutput,
  SchemaFiboEditEditStructuredInstructionInput,
  SchemaFiboEditEditStructuredInstructionOutput,
  SchemaFiboGenerateStructuredPromptInput,
  SchemaFiboGenerateStructuredPromptOutput,
  SchemaFiboLiteGenerateStructuredPromptInput,
  SchemaFiboLiteGenerateStructuredPromptLiteInput,
  SchemaFiboLiteGenerateStructuredPromptLiteOutput,
  SchemaFiboLiteGenerateStructuredPromptOutput,
} from './types.gen'

export type JsonEndpointMap = {
  'fal-ai/bagel/understand': {
    input: SchemaBagelUnderstandInput
    output: SchemaBagelUnderstandOutput
  }
  'fal-ai/ffmpeg-api/loudnorm': {
    input: SchemaFfmpegApiLoudnormInput
    output: SchemaFfmpegApiLoudnormOutput
  }
  'fal-ai/ffmpeg-api/waveform': {
    input: SchemaFfmpegApiWaveformInput
    output: SchemaFfmpegApiWaveformOutput
  }
  'fal-ai/ffmpeg-api/metadata': {
    input: SchemaFfmpegApiMetadataInput
    output: SchemaFfmpegApiMetadataOutput
  }
  'bria/fibo-edit/edit/structured_instruction': {
    input: SchemaFiboEditEditStructuredInstructionInput
    output: SchemaFiboEditEditStructuredInstructionOutput
  }
  'bria/fibo-lite/generate/structured_prompt': {
    input: SchemaFiboLiteGenerateStructuredPromptInput
    output: SchemaFiboLiteGenerateStructuredPromptOutput
  }
  'bria/fibo-lite/generate/structured_prompt/lite': {
    input: SchemaFiboLiteGenerateStructuredPromptLiteInput
    output: SchemaFiboLiteGenerateStructuredPromptLiteOutput
  }
  'bria/fibo/generate/structured_prompt': {
    input: SchemaFiboGenerateStructuredPromptInput
    output: SchemaFiboGenerateStructuredPromptOutput
  }
}

/** Union type of all json model endpoint IDs */
export type JsonModel = keyof JsonEndpointMap

export const JsonSchemaMap: Record<
  JsonModel,
  {
    input: z.ZodSchema<JsonModelInput<JsonModel>>
    output: z.ZodSchema<JsonModelOutput<JsonModel>>
  }
> = {
  ['fal-ai/bagel/understand']: {
    input: zSchemaBagelUnderstandInput,
    output: zSchemaBagelUnderstandOutput,
  },
  ['fal-ai/ffmpeg-api/loudnorm']: {
    input: zSchemaFfmpegApiLoudnormInput,
    output: zSchemaFfmpegApiLoudnormOutput,
  },
  ['fal-ai/ffmpeg-api/waveform']: {
    input: zSchemaFfmpegApiWaveformInput,
    output: zSchemaFfmpegApiWaveformOutput,
  },
  ['fal-ai/ffmpeg-api/metadata']: {
    input: zSchemaFfmpegApiMetadataInput,
    output: zSchemaFfmpegApiMetadataOutput,
  },
  ['bria/fibo-edit/edit/structured_instruction']: {
    input: zSchemaFiboEditEditStructuredInstructionInput,
    output: zSchemaFiboEditEditStructuredInstructionOutput,
  },
  ['bria/fibo-lite/generate/structured_prompt']: {
    input: zSchemaFiboLiteGenerateStructuredPromptInput,
    output: zSchemaFiboLiteGenerateStructuredPromptOutput,
  },
  ['bria/fibo-lite/generate/structured_prompt/lite']: {
    input: zSchemaFiboLiteGenerateStructuredPromptLiteInput,
    output: zSchemaFiboLiteGenerateStructuredPromptLiteOutput,
  },
  ['bria/fibo/generate/structured_prompt']: {
    input: zSchemaFiboGenerateStructuredPromptInput,
    output: zSchemaFiboGenerateStructuredPromptOutput,
  },
}

/** Get the input type for a specific json model */
export type JsonModelInput<T extends JsonModel> = JsonEndpointMap[T]['input']

/** Get the output type for a specific json model */
export type JsonModelOutput<T extends JsonModel> = JsonEndpointMap[T]['output']
