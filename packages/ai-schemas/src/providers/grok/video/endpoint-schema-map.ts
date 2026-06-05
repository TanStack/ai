// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  EditVideoRequestSchema,
  ExtendVideoRequestSchema,
  GenerateVideoRequestSchema,
  StartDeferredResponseSchema,
} from './schemas.gen.js'

/**
 * Map of grok-video endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const grokVideoEndpointSchemaMap: {
  readonly 'v1/videos/edits': {
    readonly input: typeof EditVideoRequestSchema
    readonly output: typeof StartDeferredResponseSchema
  }
  readonly 'v1/videos/extensions': {
    readonly input: typeof ExtendVideoRequestSchema
    readonly output: typeof StartDeferredResponseSchema
  }
  readonly 'v1/videos/generations': {
    readonly input: typeof GenerateVideoRequestSchema
    readonly output: typeof StartDeferredResponseSchema
  }
} = {
  'v1/videos/edits': {
    input: EditVideoRequestSchema,
    output: StartDeferredResponseSchema,
  },
  'v1/videos/extensions': {
    input: ExtendVideoRequestSchema,
    output: StartDeferredResponseSchema,
  },
  'v1/videos/generations': {
    input: GenerateVideoRequestSchema,
    output: StartDeferredResponseSchema,
  },
}
