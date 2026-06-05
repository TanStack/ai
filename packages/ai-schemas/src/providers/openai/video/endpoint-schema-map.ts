// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  CreateVideoCharacterBodySchema,
  CreateVideoEditJsonBodySchema,
  CreateVideoExtendJsonBodySchema,
  CreateVideoJsonBodySchema,
  CreateVideoRemixBodySchema,
  VideoCharacterResourceSchema,
  VideoResourceSchema,
} from './schemas.gen.js'

/**
 * Map of openai-video endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openaiVideoEndpointSchemaMap: {
  readonly videos: {
    readonly input: typeof CreateVideoJsonBodySchema
    readonly output: typeof VideoResourceSchema
  }
  readonly 'videos/{video_id}/remix': {
    readonly input: typeof CreateVideoRemixBodySchema
    readonly output: typeof VideoResourceSchema
  }
  readonly 'videos/characters': {
    readonly input: typeof CreateVideoCharacterBodySchema
    readonly output: typeof VideoCharacterResourceSchema
  }
  readonly 'videos/edits': {
    readonly input: typeof CreateVideoEditJsonBodySchema
    readonly output: typeof VideoResourceSchema
  }
  readonly 'videos/extensions': {
    readonly input: typeof CreateVideoExtendJsonBodySchema
    readonly output: typeof VideoResourceSchema
  }
} = {
  videos: { input: CreateVideoJsonBodySchema, output: VideoResourceSchema },
  'videos/{video_id}/remix': {
    input: CreateVideoRemixBodySchema,
    output: VideoResourceSchema,
  },
  'videos/characters': {
    input: CreateVideoCharacterBodySchema,
    output: VideoCharacterResourceSchema,
  },
  'videos/edits': {
    input: CreateVideoEditJsonBodySchema,
    output: VideoResourceSchema,
  },
  'videos/extensions': {
    input: CreateVideoExtendJsonBodySchema,
    output: VideoResourceSchema,
  },
}
