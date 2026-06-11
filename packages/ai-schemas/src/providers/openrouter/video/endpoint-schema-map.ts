// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  VideoGenerationRequestAlibabaWan26Schema,
  VideoGenerationRequestAlibabaWan27Schema,
  VideoGenerationRequestBytedanceSeedance15ProSchema,
  VideoGenerationRequestBytedanceSeedance20FastSchema,
  VideoGenerationRequestBytedanceSeedance20Schema,
  VideoGenerationRequestGoogleVeo31FastSchema,
  VideoGenerationRequestGoogleVeo31LiteSchema,
  VideoGenerationRequestGoogleVeo31Schema,
  VideoGenerationRequestKwaivgiKlingV30ProSchema,
  VideoGenerationRequestKwaivgiKlingV30StdSchema,
  VideoGenerationRequestKwaivgiKlingVideoO1Schema,
  VideoGenerationRequestMinimaxHailuo23Schema,
  VideoGenerationRequestOpenaiSora2ProSchema,
  VideoGenerationRequestSchema,
  VideoGenerationRequestXAiGrokImagineVideoSchema,
  VideoGenerationResponseSchema,
} from './schemas.gen.js'

/**
 * Map of openrouter-video endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openrouterVideoEndpointSchemaMap: {
  readonly videos: {
    readonly input: typeof VideoGenerationRequestSchema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/alibaba/wan-2.6': {
    readonly input: typeof VideoGenerationRequestAlibabaWan26Schema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/alibaba/wan-2.7': {
    readonly input: typeof VideoGenerationRequestAlibabaWan27Schema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/bytedance/seedance-1-5-pro': {
    readonly input: typeof VideoGenerationRequestBytedanceSeedance15ProSchema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/bytedance/seedance-2.0': {
    readonly input: typeof VideoGenerationRequestBytedanceSeedance20Schema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/bytedance/seedance-2.0-fast': {
    readonly input: typeof VideoGenerationRequestBytedanceSeedance20FastSchema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/google/veo-3.1': {
    readonly input: typeof VideoGenerationRequestGoogleVeo31Schema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/google/veo-3.1-fast': {
    readonly input: typeof VideoGenerationRequestGoogleVeo31FastSchema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/google/veo-3.1-lite': {
    readonly input: typeof VideoGenerationRequestGoogleVeo31LiteSchema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/kwaivgi/kling-v3.0-pro': {
    readonly input: typeof VideoGenerationRequestKwaivgiKlingV30ProSchema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/kwaivgi/kling-v3.0-std': {
    readonly input: typeof VideoGenerationRequestKwaivgiKlingV30StdSchema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/kwaivgi/kling-video-o1': {
    readonly input: typeof VideoGenerationRequestKwaivgiKlingVideoO1Schema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/minimax/hailuo-2.3': {
    readonly input: typeof VideoGenerationRequestMinimaxHailuo23Schema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/openai/sora-2-pro': {
    readonly input: typeof VideoGenerationRequestOpenaiSora2ProSchema
    readonly output: typeof VideoGenerationResponseSchema
  }
  readonly 'videos/x-ai/grok-imagine-video': {
    readonly input: typeof VideoGenerationRequestXAiGrokImagineVideoSchema
    readonly output: typeof VideoGenerationResponseSchema
  }
} = {
  videos: {
    input: VideoGenerationRequestSchema,
    output: VideoGenerationResponseSchema,
  },
  'videos/alibaba/wan-2.6': {
    input: VideoGenerationRequestAlibabaWan26Schema,
    output: VideoGenerationResponseSchema,
  },
  'videos/alibaba/wan-2.7': {
    input: VideoGenerationRequestAlibabaWan27Schema,
    output: VideoGenerationResponseSchema,
  },
  'videos/bytedance/seedance-1-5-pro': {
    input: VideoGenerationRequestBytedanceSeedance15ProSchema,
    output: VideoGenerationResponseSchema,
  },
  'videos/bytedance/seedance-2.0': {
    input: VideoGenerationRequestBytedanceSeedance20Schema,
    output: VideoGenerationResponseSchema,
  },
  'videos/bytedance/seedance-2.0-fast': {
    input: VideoGenerationRequestBytedanceSeedance20FastSchema,
    output: VideoGenerationResponseSchema,
  },
  'videos/google/veo-3.1': {
    input: VideoGenerationRequestGoogleVeo31Schema,
    output: VideoGenerationResponseSchema,
  },
  'videos/google/veo-3.1-fast': {
    input: VideoGenerationRequestGoogleVeo31FastSchema,
    output: VideoGenerationResponseSchema,
  },
  'videos/google/veo-3.1-lite': {
    input: VideoGenerationRequestGoogleVeo31LiteSchema,
    output: VideoGenerationResponseSchema,
  },
  'videos/kwaivgi/kling-v3.0-pro': {
    input: VideoGenerationRequestKwaivgiKlingV30ProSchema,
    output: VideoGenerationResponseSchema,
  },
  'videos/kwaivgi/kling-v3.0-std': {
    input: VideoGenerationRequestKwaivgiKlingV30StdSchema,
    output: VideoGenerationResponseSchema,
  },
  'videos/kwaivgi/kling-video-o1': {
    input: VideoGenerationRequestKwaivgiKlingVideoO1Schema,
    output: VideoGenerationResponseSchema,
  },
  'videos/minimax/hailuo-2.3': {
    input: VideoGenerationRequestMinimaxHailuo23Schema,
    output: VideoGenerationResponseSchema,
  },
  'videos/openai/sora-2-pro': {
    input: VideoGenerationRequestOpenaiSora2ProSchema,
    output: VideoGenerationResponseSchema,
  },
  'videos/x-ai/grok-imagine-video': {
    input: VideoGenerationRequestXAiGrokImagineVideoSchema,
    output: VideoGenerationResponseSchema,
  },
}
