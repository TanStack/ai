// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zCreateVideoCharacterBody,
  zCreateVideoEditJsonBody,
  zCreateVideoExtendJsonBody,
  zCreateVideoJsonBody,
  zCreateVideoRemixBody,
  zVideoCharacterResource,
  zVideoResource,
} from './zod.gen.js'

/**
 * Map of openai-video endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openaiVideoEndpointZodMap: {
  readonly videos: {
    readonly input: typeof zCreateVideoJsonBody
    readonly output: typeof zVideoResource
  }
  readonly 'videos/{video_id}/remix': {
    readonly input: typeof zCreateVideoRemixBody
    readonly output: typeof zVideoResource
  }
  readonly 'videos/characters': {
    readonly input: typeof zCreateVideoCharacterBody
    readonly output: typeof zVideoCharacterResource
  }
  readonly 'videos/edits': {
    readonly input: typeof zCreateVideoEditJsonBody
    readonly output: typeof zVideoResource
  }
  readonly 'videos/extensions': {
    readonly input: typeof zCreateVideoExtendJsonBody
    readonly output: typeof zVideoResource
  }
} = {
  videos: { input: zCreateVideoJsonBody, output: zVideoResource },
  'videos/{video_id}/remix': {
    input: zCreateVideoRemixBody,
    output: zVideoResource,
  },
  'videos/characters': {
    input: zCreateVideoCharacterBody,
    output: zVideoCharacterResource,
  },
  'videos/edits': { input: zCreateVideoEditJsonBody, output: zVideoResource },
  'videos/extensions': {
    input: zCreateVideoExtendJsonBody,
    output: zVideoResource,
  },
}

/** Union of valid openai-video endpoint ids. */
export type OpenaiVideoEndpointId = keyof typeof openaiVideoEndpointZodMap
