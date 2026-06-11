// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zVideoGenerationRequest,
  zVideoGenerationRequestAlibabaWan26,
  zVideoGenerationRequestAlibabaWan27,
  zVideoGenerationRequestBytedanceSeedance15Pro,
  zVideoGenerationRequestBytedanceSeedance20,
  zVideoGenerationRequestBytedanceSeedance20Fast,
  zVideoGenerationRequestGoogleVeo31,
  zVideoGenerationRequestGoogleVeo31Fast,
  zVideoGenerationRequestGoogleVeo31Lite,
  zVideoGenerationRequestKwaivgiKlingV30Pro,
  zVideoGenerationRequestKwaivgiKlingV30Std,
  zVideoGenerationRequestKwaivgiKlingVideoO1,
  zVideoGenerationRequestMinimaxHailuo23,
  zVideoGenerationRequestOpenaiSora2Pro,
  zVideoGenerationRequestXAiGrokImagineVideo,
  zVideoGenerationResponse,
} from './zod.gen.js'

/**
 * Map of openrouter-video endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openrouterVideoEndpointZodMap: {
  readonly videos: {
    readonly input: typeof zVideoGenerationRequest
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/alibaba/wan-2.6': {
    readonly input: typeof zVideoGenerationRequestAlibabaWan26
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/alibaba/wan-2.7': {
    readonly input: typeof zVideoGenerationRequestAlibabaWan27
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/bytedance/seedance-1-5-pro': {
    readonly input: typeof zVideoGenerationRequestBytedanceSeedance15Pro
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/bytedance/seedance-2.0': {
    readonly input: typeof zVideoGenerationRequestBytedanceSeedance20
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/bytedance/seedance-2.0-fast': {
    readonly input: typeof zVideoGenerationRequestBytedanceSeedance20Fast
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/google/veo-3.1': {
    readonly input: typeof zVideoGenerationRequestGoogleVeo31
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/google/veo-3.1-fast': {
    readonly input: typeof zVideoGenerationRequestGoogleVeo31Fast
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/google/veo-3.1-lite': {
    readonly input: typeof zVideoGenerationRequestGoogleVeo31Lite
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/kwaivgi/kling-v3.0-pro': {
    readonly input: typeof zVideoGenerationRequestKwaivgiKlingV30Pro
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/kwaivgi/kling-v3.0-std': {
    readonly input: typeof zVideoGenerationRequestKwaivgiKlingV30Std
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/kwaivgi/kling-video-o1': {
    readonly input: typeof zVideoGenerationRequestKwaivgiKlingVideoO1
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/minimax/hailuo-2.3': {
    readonly input: typeof zVideoGenerationRequestMinimaxHailuo23
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/openai/sora-2-pro': {
    readonly input: typeof zVideoGenerationRequestOpenaiSora2Pro
    readonly output: typeof zVideoGenerationResponse
  }
  readonly 'videos/x-ai/grok-imagine-video': {
    readonly input: typeof zVideoGenerationRequestXAiGrokImagineVideo
    readonly output: typeof zVideoGenerationResponse
  }
} = {
  videos: { input: zVideoGenerationRequest, output: zVideoGenerationResponse },
  'videos/alibaba/wan-2.6': {
    input: zVideoGenerationRequestAlibabaWan26,
    output: zVideoGenerationResponse,
  },
  'videos/alibaba/wan-2.7': {
    input: zVideoGenerationRequestAlibabaWan27,
    output: zVideoGenerationResponse,
  },
  'videos/bytedance/seedance-1-5-pro': {
    input: zVideoGenerationRequestBytedanceSeedance15Pro,
    output: zVideoGenerationResponse,
  },
  'videos/bytedance/seedance-2.0': {
    input: zVideoGenerationRequestBytedanceSeedance20,
    output: zVideoGenerationResponse,
  },
  'videos/bytedance/seedance-2.0-fast': {
    input: zVideoGenerationRequestBytedanceSeedance20Fast,
    output: zVideoGenerationResponse,
  },
  'videos/google/veo-3.1': {
    input: zVideoGenerationRequestGoogleVeo31,
    output: zVideoGenerationResponse,
  },
  'videos/google/veo-3.1-fast': {
    input: zVideoGenerationRequestGoogleVeo31Fast,
    output: zVideoGenerationResponse,
  },
  'videos/google/veo-3.1-lite': {
    input: zVideoGenerationRequestGoogleVeo31Lite,
    output: zVideoGenerationResponse,
  },
  'videos/kwaivgi/kling-v3.0-pro': {
    input: zVideoGenerationRequestKwaivgiKlingV30Pro,
    output: zVideoGenerationResponse,
  },
  'videos/kwaivgi/kling-v3.0-std': {
    input: zVideoGenerationRequestKwaivgiKlingV30Std,
    output: zVideoGenerationResponse,
  },
  'videos/kwaivgi/kling-video-o1': {
    input: zVideoGenerationRequestKwaivgiKlingVideoO1,
    output: zVideoGenerationResponse,
  },
  'videos/minimax/hailuo-2.3': {
    input: zVideoGenerationRequestMinimaxHailuo23,
    output: zVideoGenerationResponse,
  },
  'videos/openai/sora-2-pro': {
    input: zVideoGenerationRequestOpenaiSora2Pro,
    output: zVideoGenerationResponse,
  },
  'videos/x-ai/grok-imagine-video': {
    input: zVideoGenerationRequestXAiGrokImagineVideo,
    output: zVideoGenerationResponse,
  },
}

/** Union of valid openrouter-video endpoint ids. */
export type OpenrouterVideoEndpointId =
  keyof typeof openrouterVideoEndpointZodMap
