// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  Florence2LargeCaptionInputSchema,
  Florence2LargeCaptionOutputSchema,
  Florence2LargeDetailedCaptionInputSchema,
  Florence2LargeDetailedCaptionOutputSchema,
  Florence2LargeMoreDetailedCaptionInputSchema,
  Florence2LargeMoreDetailedCaptionOutputSchema,
  Florence2LargeOcrInputSchema,
  Florence2LargeOcrOutputSchema,
  Florence2LargeRegionToCategoryInputSchema,
  Florence2LargeRegionToCategoryOutputSchema,
  Florence2LargeRegionToDescriptionInputSchema,
  Florence2LargeRegionToDescriptionOutputSchema,
  GotOcrV2InputSchema,
  GotOcrV2OutputSchema,
  ImageutilsNsfwInputSchema,
  ImageutilsNsfwOutputSchema,
  Isaac01InputSchema,
  Isaac01OpenaiV1ChatCompletionsInputSchema,
  Isaac01OpenaiV1ChatCompletionsOutputSchema,
  Isaac01OutputSchema,
  LlavaNextInputSchema,
  LlavaNextOutputSchema,
  MarlinFindInputSchema,
  MarlinFindOutputSchema,
  MarlinInputSchema,
  MarlinOutputSchema,
  Moondream2InputSchema,
  Moondream2ObjectDetectionInputSchema,
  Moondream2ObjectDetectionOutputSchema,
  Moondream2OutputSchema,
  Moondream2PointObjectDetectionInputSchema,
  Moondream2PointObjectDetectionOutputSchema,
  Moondream2VisualQueryInputSchema,
  Moondream2VisualQueryOutputSchema,
  Moondream3PreviewCaptionInputSchema,
  Moondream3PreviewCaptionOutputSchema,
  Moondream3PreviewDetectInputSchema,
  Moondream3PreviewDetectOutputSchema,
  Moondream3PreviewPointInputSchema,
  Moondream3PreviewPointOutputSchema,
  Moondream3PreviewQueryInputSchema,
  Moondream3PreviewQueryOutputSchema,
  MoondreamBatchedInputSchema,
  MoondreamBatchedOutputSchema,
  MoondreamNextBatchInputSchema,
  MoondreamNextBatchOutputSchema,
  MoondreamNextInputSchema,
  MoondreamNextOutputSchema,
  NemotronDiffusionVlmInputSchema,
  NemotronDiffusionVlmOutputSchema,
  RouterVisionInputSchema,
  RouterVisionOutputSchema,
  Sa2va4bImageInputSchema,
  Sa2va4bImageOutputSchema,
  Sa2va4bVideoInputSchema,
  Sa2va4bVideoOutputSchema,
  Sa2va8bImageInputSchema,
  Sa2va8bImageOutputSchema,
  Sa2va8bVideoInputSchema,
  Sa2va8bVideoOutputSchema,
  Sam3ImageEmbedInputSchema,
  Sam3ImageEmbedOutputSchema,
  SceneFinderInputSchema,
  SceneFinderOutputSchema,
  VideoUnderstandingInputSchema,
  VideoUnderstandingOutputSchema,
  XAilabNsfwInputSchema,
  XAilabNsfwOutputSchema,
} from './schemas.gen.js'

/**
 * Map of fal-vision endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const falVisionEndpointSchemaMap: {
  readonly 'fal-ai/florence-2-large/caption': {
    readonly input: typeof Florence2LargeCaptionInputSchema
    readonly output: typeof Florence2LargeCaptionOutputSchema
  }
  readonly 'fal-ai/florence-2-large/detailed-caption': {
    readonly input: typeof Florence2LargeDetailedCaptionInputSchema
    readonly output: typeof Florence2LargeDetailedCaptionOutputSchema
  }
  readonly 'fal-ai/florence-2-large/more-detailed-caption': {
    readonly input: typeof Florence2LargeMoreDetailedCaptionInputSchema
    readonly output: typeof Florence2LargeMoreDetailedCaptionOutputSchema
  }
  readonly 'fal-ai/florence-2-large/ocr': {
    readonly input: typeof Florence2LargeOcrInputSchema
    readonly output: typeof Florence2LargeOcrOutputSchema
  }
  readonly 'fal-ai/florence-2-large/region-to-category': {
    readonly input: typeof Florence2LargeRegionToCategoryInputSchema
    readonly output: typeof Florence2LargeRegionToCategoryOutputSchema
  }
  readonly 'fal-ai/florence-2-large/region-to-description': {
    readonly input: typeof Florence2LargeRegionToDescriptionInputSchema
    readonly output: typeof Florence2LargeRegionToDescriptionOutputSchema
  }
  readonly 'fal-ai/got-ocr/v2': {
    readonly input: typeof GotOcrV2InputSchema
    readonly output: typeof GotOcrV2OutputSchema
  }
  readonly 'fal-ai/imageutils/nsfw': {
    readonly input: typeof ImageutilsNsfwInputSchema
    readonly output: typeof ImageutilsNsfwOutputSchema
  }
  readonly 'fal-ai/llava-next': {
    readonly input: typeof LlavaNextInputSchema
    readonly output: typeof LlavaNextOutputSchema
  }
  readonly 'fal-ai/marlin': {
    readonly input: typeof MarlinInputSchema
    readonly output: typeof MarlinOutputSchema
  }
  readonly 'fal-ai/marlin/find': {
    readonly input: typeof MarlinFindInputSchema
    readonly output: typeof MarlinFindOutputSchema
  }
  readonly 'fal-ai/moondream-next': {
    readonly input: typeof MoondreamNextInputSchema
    readonly output: typeof MoondreamNextOutputSchema
  }
  readonly 'fal-ai/moondream-next/batch': {
    readonly input: typeof MoondreamNextBatchInputSchema
    readonly output: typeof MoondreamNextBatchOutputSchema
  }
  readonly 'fal-ai/moondream/batched': {
    readonly input: typeof MoondreamBatchedInputSchema
    readonly output: typeof MoondreamBatchedOutputSchema
  }
  readonly 'fal-ai/moondream2': {
    readonly input: typeof Moondream2InputSchema
    readonly output: typeof Moondream2OutputSchema
  }
  readonly 'fal-ai/moondream2/object-detection': {
    readonly input: typeof Moondream2ObjectDetectionInputSchema
    readonly output: typeof Moondream2ObjectDetectionOutputSchema
  }
  readonly 'fal-ai/moondream2/point-object-detection': {
    readonly input: typeof Moondream2PointObjectDetectionInputSchema
    readonly output: typeof Moondream2PointObjectDetectionOutputSchema
  }
  readonly 'fal-ai/moondream2/visual-query': {
    readonly input: typeof Moondream2VisualQueryInputSchema
    readonly output: typeof Moondream2VisualQueryOutputSchema
  }
  readonly 'fal-ai/moondream3-preview/caption': {
    readonly input: typeof Moondream3PreviewCaptionInputSchema
    readonly output: typeof Moondream3PreviewCaptionOutputSchema
  }
  readonly 'fal-ai/moondream3-preview/detect': {
    readonly input: typeof Moondream3PreviewDetectInputSchema
    readonly output: typeof Moondream3PreviewDetectOutputSchema
  }
  readonly 'fal-ai/moondream3-preview/point': {
    readonly input: typeof Moondream3PreviewPointInputSchema
    readonly output: typeof Moondream3PreviewPointOutputSchema
  }
  readonly 'fal-ai/moondream3-preview/query': {
    readonly input: typeof Moondream3PreviewQueryInputSchema
    readonly output: typeof Moondream3PreviewQueryOutputSchema
  }
  readonly 'fal-ai/nemotron-diffusion-vlm': {
    readonly input: typeof NemotronDiffusionVlmInputSchema
    readonly output: typeof NemotronDiffusionVlmOutputSchema
  }
  readonly 'fal-ai/sa2va/4b/image': {
    readonly input: typeof Sa2va4bImageInputSchema
    readonly output: typeof Sa2va4bImageOutputSchema
  }
  readonly 'fal-ai/sa2va/4b/video': {
    readonly input: typeof Sa2va4bVideoInputSchema
    readonly output: typeof Sa2va4bVideoOutputSchema
  }
  readonly 'fal-ai/sa2va/8b/image': {
    readonly input: typeof Sa2va8bImageInputSchema
    readonly output: typeof Sa2va8bImageOutputSchema
  }
  readonly 'fal-ai/sa2va/8b/video': {
    readonly input: typeof Sa2va8bVideoInputSchema
    readonly output: typeof Sa2va8bVideoOutputSchema
  }
  readonly 'fal-ai/sam-3/image/embed': {
    readonly input: typeof Sam3ImageEmbedInputSchema
    readonly output: typeof Sam3ImageEmbedOutputSchema
  }
  readonly 'fal-ai/scene-finder': {
    readonly input: typeof SceneFinderInputSchema
    readonly output: typeof SceneFinderOutputSchema
  }
  readonly 'fal-ai/video-understanding': {
    readonly input: typeof VideoUnderstandingInputSchema
    readonly output: typeof VideoUnderstandingOutputSchema
  }
  readonly 'fal-ai/x-ailab/nsfw': {
    readonly input: typeof XAilabNsfwInputSchema
    readonly output: typeof XAilabNsfwOutputSchema
  }
  readonly 'openrouter/router/vision': {
    readonly input: typeof RouterVisionInputSchema
    readonly output: typeof RouterVisionOutputSchema
  }
  readonly 'perceptron/isaac-01': {
    readonly input: typeof Isaac01InputSchema
    readonly output: typeof Isaac01OutputSchema
  }
  readonly 'perceptron/isaac-01/openai/v1/chat/completions': {
    readonly input: typeof Isaac01OpenaiV1ChatCompletionsInputSchema
    readonly output: typeof Isaac01OpenaiV1ChatCompletionsOutputSchema
  }
} = {
  'fal-ai/florence-2-large/caption': {
    input: Florence2LargeCaptionInputSchema,
    output: Florence2LargeCaptionOutputSchema,
  },
  'fal-ai/florence-2-large/detailed-caption': {
    input: Florence2LargeDetailedCaptionInputSchema,
    output: Florence2LargeDetailedCaptionOutputSchema,
  },
  'fal-ai/florence-2-large/more-detailed-caption': {
    input: Florence2LargeMoreDetailedCaptionInputSchema,
    output: Florence2LargeMoreDetailedCaptionOutputSchema,
  },
  'fal-ai/florence-2-large/ocr': {
    input: Florence2LargeOcrInputSchema,
    output: Florence2LargeOcrOutputSchema,
  },
  'fal-ai/florence-2-large/region-to-category': {
    input: Florence2LargeRegionToCategoryInputSchema,
    output: Florence2LargeRegionToCategoryOutputSchema,
  },
  'fal-ai/florence-2-large/region-to-description': {
    input: Florence2LargeRegionToDescriptionInputSchema,
    output: Florence2LargeRegionToDescriptionOutputSchema,
  },
  'fal-ai/got-ocr/v2': {
    input: GotOcrV2InputSchema,
    output: GotOcrV2OutputSchema,
  },
  'fal-ai/imageutils/nsfw': {
    input: ImageutilsNsfwInputSchema,
    output: ImageutilsNsfwOutputSchema,
  },
  'fal-ai/llava-next': {
    input: LlavaNextInputSchema,
    output: LlavaNextOutputSchema,
  },
  'fal-ai/marlin': { input: MarlinInputSchema, output: MarlinOutputSchema },
  'fal-ai/marlin/find': {
    input: MarlinFindInputSchema,
    output: MarlinFindOutputSchema,
  },
  'fal-ai/moondream-next': {
    input: MoondreamNextInputSchema,
    output: MoondreamNextOutputSchema,
  },
  'fal-ai/moondream-next/batch': {
    input: MoondreamNextBatchInputSchema,
    output: MoondreamNextBatchOutputSchema,
  },
  'fal-ai/moondream/batched': {
    input: MoondreamBatchedInputSchema,
    output: MoondreamBatchedOutputSchema,
  },
  'fal-ai/moondream2': {
    input: Moondream2InputSchema,
    output: Moondream2OutputSchema,
  },
  'fal-ai/moondream2/object-detection': {
    input: Moondream2ObjectDetectionInputSchema,
    output: Moondream2ObjectDetectionOutputSchema,
  },
  'fal-ai/moondream2/point-object-detection': {
    input: Moondream2PointObjectDetectionInputSchema,
    output: Moondream2PointObjectDetectionOutputSchema,
  },
  'fal-ai/moondream2/visual-query': {
    input: Moondream2VisualQueryInputSchema,
    output: Moondream2VisualQueryOutputSchema,
  },
  'fal-ai/moondream3-preview/caption': {
    input: Moondream3PreviewCaptionInputSchema,
    output: Moondream3PreviewCaptionOutputSchema,
  },
  'fal-ai/moondream3-preview/detect': {
    input: Moondream3PreviewDetectInputSchema,
    output: Moondream3PreviewDetectOutputSchema,
  },
  'fal-ai/moondream3-preview/point': {
    input: Moondream3PreviewPointInputSchema,
    output: Moondream3PreviewPointOutputSchema,
  },
  'fal-ai/moondream3-preview/query': {
    input: Moondream3PreviewQueryInputSchema,
    output: Moondream3PreviewQueryOutputSchema,
  },
  'fal-ai/nemotron-diffusion-vlm': {
    input: NemotronDiffusionVlmInputSchema,
    output: NemotronDiffusionVlmOutputSchema,
  },
  'fal-ai/sa2va/4b/image': {
    input: Sa2va4bImageInputSchema,
    output: Sa2va4bImageOutputSchema,
  },
  'fal-ai/sa2va/4b/video': {
    input: Sa2va4bVideoInputSchema,
    output: Sa2va4bVideoOutputSchema,
  },
  'fal-ai/sa2va/8b/image': {
    input: Sa2va8bImageInputSchema,
    output: Sa2va8bImageOutputSchema,
  },
  'fal-ai/sa2va/8b/video': {
    input: Sa2va8bVideoInputSchema,
    output: Sa2va8bVideoOutputSchema,
  },
  'fal-ai/sam-3/image/embed': {
    input: Sam3ImageEmbedInputSchema,
    output: Sam3ImageEmbedOutputSchema,
  },
  'fal-ai/scene-finder': {
    input: SceneFinderInputSchema,
    output: SceneFinderOutputSchema,
  },
  'fal-ai/video-understanding': {
    input: VideoUnderstandingInputSchema,
    output: VideoUnderstandingOutputSchema,
  },
  'fal-ai/x-ailab/nsfw': {
    input: XAilabNsfwInputSchema,
    output: XAilabNsfwOutputSchema,
  },
  'openrouter/router/vision': {
    input: RouterVisionInputSchema,
    output: RouterVisionOutputSchema,
  },
  'perceptron/isaac-01': {
    input: Isaac01InputSchema,
    output: Isaac01OutputSchema,
  },
  'perceptron/isaac-01/openai/v1/chat/completions': {
    input: Isaac01OpenaiV1ChatCompletionsInputSchema,
    output: Isaac01OpenaiV1ChatCompletionsOutputSchema,
  },
}
