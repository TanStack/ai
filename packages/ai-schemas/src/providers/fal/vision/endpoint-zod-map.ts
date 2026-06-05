// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zFlorence2LargeCaptionInput,
  zFlorence2LargeCaptionOutput,
  zFlorence2LargeDetailedCaptionInput,
  zFlorence2LargeDetailedCaptionOutput,
  zFlorence2LargeMoreDetailedCaptionInput,
  zFlorence2LargeMoreDetailedCaptionOutput,
  zFlorence2LargeOcrInput,
  zFlorence2LargeOcrOutput,
  zFlorence2LargeRegionToCategoryInput,
  zFlorence2LargeRegionToCategoryOutput,
  zFlorence2LargeRegionToDescriptionInput,
  zFlorence2LargeRegionToDescriptionOutput,
  zGotOcrV2Input,
  zGotOcrV2Output,
  zImageutilsNsfwInput,
  zImageutilsNsfwOutput,
  zIsaac01Input,
  zIsaac01OpenaiV1ChatCompletionsInput,
  zIsaac01OpenaiV1ChatCompletionsOutput,
  zIsaac01Output,
  zLlavaNextInput,
  zLlavaNextOutput,
  zMarlinFindInput,
  zMarlinFindOutput,
  zMarlinInput,
  zMarlinOutput,
  zMoondream2Input,
  zMoondream2ObjectDetectionInput,
  zMoondream2ObjectDetectionOutput,
  zMoondream2Output,
  zMoondream2PointObjectDetectionInput,
  zMoondream2PointObjectDetectionOutput,
  zMoondream2VisualQueryInput,
  zMoondream2VisualQueryOutput,
  zMoondream3PreviewCaptionInput,
  zMoondream3PreviewCaptionOutput,
  zMoondream3PreviewDetectInput,
  zMoondream3PreviewDetectOutput,
  zMoondream3PreviewPointInput,
  zMoondream3PreviewPointOutput,
  zMoondream3PreviewQueryInput,
  zMoondream3PreviewQueryOutput,
  zMoondreamBatchedInput,
  zMoondreamBatchedOutput,
  zMoondreamNextBatchInput,
  zMoondreamNextBatchOutput,
  zMoondreamNextInput,
  zMoondreamNextOutput,
  zNemotronDiffusionVlmInput,
  zNemotronDiffusionVlmOutput,
  zRouterVisionInput,
  zRouterVisionOutput,
  zSa2Va4bImageInput,
  zSa2Va4bImageOutput,
  zSa2Va4bVideoInput,
  zSa2Va4bVideoOutput,
  zSa2Va8bImageInput,
  zSa2Va8bImageOutput,
  zSa2Va8bVideoInput,
  zSa2Va8bVideoOutput,
  zSam3ImageEmbedInput,
  zSam3ImageEmbedOutput,
  zSceneFinderInput,
  zSceneFinderOutput,
  zVideoUnderstandingInput,
  zVideoUnderstandingOutput,
  zXAilabNsfwInput,
  zXAilabNsfwOutput,
} from './zod.gen.js'

/**
 * Map of fal-vision endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const falVisionEndpointZodMap: {
  readonly 'fal-ai/florence-2-large/caption': {
    readonly input: typeof zFlorence2LargeCaptionInput
    readonly output: typeof zFlorence2LargeCaptionOutput
  }
  readonly 'fal-ai/florence-2-large/detailed-caption': {
    readonly input: typeof zFlorence2LargeDetailedCaptionInput
    readonly output: typeof zFlorence2LargeDetailedCaptionOutput
  }
  readonly 'fal-ai/florence-2-large/more-detailed-caption': {
    readonly input: typeof zFlorence2LargeMoreDetailedCaptionInput
    readonly output: typeof zFlorence2LargeMoreDetailedCaptionOutput
  }
  readonly 'fal-ai/florence-2-large/ocr': {
    readonly input: typeof zFlorence2LargeOcrInput
    readonly output: typeof zFlorence2LargeOcrOutput
  }
  readonly 'fal-ai/florence-2-large/region-to-category': {
    readonly input: typeof zFlorence2LargeRegionToCategoryInput
    readonly output: typeof zFlorence2LargeRegionToCategoryOutput
  }
  readonly 'fal-ai/florence-2-large/region-to-description': {
    readonly input: typeof zFlorence2LargeRegionToDescriptionInput
    readonly output: typeof zFlorence2LargeRegionToDescriptionOutput
  }
  readonly 'fal-ai/got-ocr/v2': {
    readonly input: typeof zGotOcrV2Input
    readonly output: typeof zGotOcrV2Output
  }
  readonly 'fal-ai/imageutils/nsfw': {
    readonly input: typeof zImageutilsNsfwInput
    readonly output: typeof zImageutilsNsfwOutput
  }
  readonly 'fal-ai/llava-next': {
    readonly input: typeof zLlavaNextInput
    readonly output: typeof zLlavaNextOutput
  }
  readonly 'fal-ai/marlin': {
    readonly input: typeof zMarlinInput
    readonly output: typeof zMarlinOutput
  }
  readonly 'fal-ai/marlin/find': {
    readonly input: typeof zMarlinFindInput
    readonly output: typeof zMarlinFindOutput
  }
  readonly 'fal-ai/moondream-next': {
    readonly input: typeof zMoondreamNextInput
    readonly output: typeof zMoondreamNextOutput
  }
  readonly 'fal-ai/moondream-next/batch': {
    readonly input: typeof zMoondreamNextBatchInput
    readonly output: typeof zMoondreamNextBatchOutput
  }
  readonly 'fal-ai/moondream/batched': {
    readonly input: typeof zMoondreamBatchedInput
    readonly output: typeof zMoondreamBatchedOutput
  }
  readonly 'fal-ai/moondream2': {
    readonly input: typeof zMoondream2Input
    readonly output: typeof zMoondream2Output
  }
  readonly 'fal-ai/moondream2/object-detection': {
    readonly input: typeof zMoondream2ObjectDetectionInput
    readonly output: typeof zMoondream2ObjectDetectionOutput
  }
  readonly 'fal-ai/moondream2/point-object-detection': {
    readonly input: typeof zMoondream2PointObjectDetectionInput
    readonly output: typeof zMoondream2PointObjectDetectionOutput
  }
  readonly 'fal-ai/moondream2/visual-query': {
    readonly input: typeof zMoondream2VisualQueryInput
    readonly output: typeof zMoondream2VisualQueryOutput
  }
  readonly 'fal-ai/moondream3-preview/caption': {
    readonly input: typeof zMoondream3PreviewCaptionInput
    readonly output: typeof zMoondream3PreviewCaptionOutput
  }
  readonly 'fal-ai/moondream3-preview/detect': {
    readonly input: typeof zMoondream3PreviewDetectInput
    readonly output: typeof zMoondream3PreviewDetectOutput
  }
  readonly 'fal-ai/moondream3-preview/point': {
    readonly input: typeof zMoondream3PreviewPointInput
    readonly output: typeof zMoondream3PreviewPointOutput
  }
  readonly 'fal-ai/moondream3-preview/query': {
    readonly input: typeof zMoondream3PreviewQueryInput
    readonly output: typeof zMoondream3PreviewQueryOutput
  }
  readonly 'fal-ai/nemotron-diffusion-vlm': {
    readonly input: typeof zNemotronDiffusionVlmInput
    readonly output: typeof zNemotronDiffusionVlmOutput
  }
  readonly 'fal-ai/sa2va/4b/image': {
    readonly input: typeof zSa2Va4bImageInput
    readonly output: typeof zSa2Va4bImageOutput
  }
  readonly 'fal-ai/sa2va/4b/video': {
    readonly input: typeof zSa2Va4bVideoInput
    readonly output: typeof zSa2Va4bVideoOutput
  }
  readonly 'fal-ai/sa2va/8b/image': {
    readonly input: typeof zSa2Va8bImageInput
    readonly output: typeof zSa2Va8bImageOutput
  }
  readonly 'fal-ai/sa2va/8b/video': {
    readonly input: typeof zSa2Va8bVideoInput
    readonly output: typeof zSa2Va8bVideoOutput
  }
  readonly 'fal-ai/sam-3/image/embed': {
    readonly input: typeof zSam3ImageEmbedInput
    readonly output: typeof zSam3ImageEmbedOutput
  }
  readonly 'fal-ai/scene-finder': {
    readonly input: typeof zSceneFinderInput
    readonly output: typeof zSceneFinderOutput
  }
  readonly 'fal-ai/video-understanding': {
    readonly input: typeof zVideoUnderstandingInput
    readonly output: typeof zVideoUnderstandingOutput
  }
  readonly 'fal-ai/x-ailab/nsfw': {
    readonly input: typeof zXAilabNsfwInput
    readonly output: typeof zXAilabNsfwOutput
  }
  readonly 'openrouter/router/vision': {
    readonly input: typeof zRouterVisionInput
    readonly output: typeof zRouterVisionOutput
  }
  readonly 'perceptron/isaac-01': {
    readonly input: typeof zIsaac01Input
    readonly output: typeof zIsaac01Output
  }
  readonly 'perceptron/isaac-01/openai/v1/chat/completions': {
    readonly input: typeof zIsaac01OpenaiV1ChatCompletionsInput
    readonly output: typeof zIsaac01OpenaiV1ChatCompletionsOutput
  }
} = {
  'fal-ai/florence-2-large/caption': {
    input: zFlorence2LargeCaptionInput,
    output: zFlorence2LargeCaptionOutput,
  },
  'fal-ai/florence-2-large/detailed-caption': {
    input: zFlorence2LargeDetailedCaptionInput,
    output: zFlorence2LargeDetailedCaptionOutput,
  },
  'fal-ai/florence-2-large/more-detailed-caption': {
    input: zFlorence2LargeMoreDetailedCaptionInput,
    output: zFlorence2LargeMoreDetailedCaptionOutput,
  },
  'fal-ai/florence-2-large/ocr': {
    input: zFlorence2LargeOcrInput,
    output: zFlorence2LargeOcrOutput,
  },
  'fal-ai/florence-2-large/region-to-category': {
    input: zFlorence2LargeRegionToCategoryInput,
    output: zFlorence2LargeRegionToCategoryOutput,
  },
  'fal-ai/florence-2-large/region-to-description': {
    input: zFlorence2LargeRegionToDescriptionInput,
    output: zFlorence2LargeRegionToDescriptionOutput,
  },
  'fal-ai/got-ocr/v2': { input: zGotOcrV2Input, output: zGotOcrV2Output },
  'fal-ai/imageutils/nsfw': {
    input: zImageutilsNsfwInput,
    output: zImageutilsNsfwOutput,
  },
  'fal-ai/llava-next': { input: zLlavaNextInput, output: zLlavaNextOutput },
  'fal-ai/marlin': { input: zMarlinInput, output: zMarlinOutput },
  'fal-ai/marlin/find': { input: zMarlinFindInput, output: zMarlinFindOutput },
  'fal-ai/moondream-next': {
    input: zMoondreamNextInput,
    output: zMoondreamNextOutput,
  },
  'fal-ai/moondream-next/batch': {
    input: zMoondreamNextBatchInput,
    output: zMoondreamNextBatchOutput,
  },
  'fal-ai/moondream/batched': {
    input: zMoondreamBatchedInput,
    output: zMoondreamBatchedOutput,
  },
  'fal-ai/moondream2': { input: zMoondream2Input, output: zMoondream2Output },
  'fal-ai/moondream2/object-detection': {
    input: zMoondream2ObjectDetectionInput,
    output: zMoondream2ObjectDetectionOutput,
  },
  'fal-ai/moondream2/point-object-detection': {
    input: zMoondream2PointObjectDetectionInput,
    output: zMoondream2PointObjectDetectionOutput,
  },
  'fal-ai/moondream2/visual-query': {
    input: zMoondream2VisualQueryInput,
    output: zMoondream2VisualQueryOutput,
  },
  'fal-ai/moondream3-preview/caption': {
    input: zMoondream3PreviewCaptionInput,
    output: zMoondream3PreviewCaptionOutput,
  },
  'fal-ai/moondream3-preview/detect': {
    input: zMoondream3PreviewDetectInput,
    output: zMoondream3PreviewDetectOutput,
  },
  'fal-ai/moondream3-preview/point': {
    input: zMoondream3PreviewPointInput,
    output: zMoondream3PreviewPointOutput,
  },
  'fal-ai/moondream3-preview/query': {
    input: zMoondream3PreviewQueryInput,
    output: zMoondream3PreviewQueryOutput,
  },
  'fal-ai/nemotron-diffusion-vlm': {
    input: zNemotronDiffusionVlmInput,
    output: zNemotronDiffusionVlmOutput,
  },
  'fal-ai/sa2va/4b/image': {
    input: zSa2Va4bImageInput,
    output: zSa2Va4bImageOutput,
  },
  'fal-ai/sa2va/4b/video': {
    input: zSa2Va4bVideoInput,
    output: zSa2Va4bVideoOutput,
  },
  'fal-ai/sa2va/8b/image': {
    input: zSa2Va8bImageInput,
    output: zSa2Va8bImageOutput,
  },
  'fal-ai/sa2va/8b/video': {
    input: zSa2Va8bVideoInput,
    output: zSa2Va8bVideoOutput,
  },
  'fal-ai/sam-3/image/embed': {
    input: zSam3ImageEmbedInput,
    output: zSam3ImageEmbedOutput,
  },
  'fal-ai/scene-finder': {
    input: zSceneFinderInput,
    output: zSceneFinderOutput,
  },
  'fal-ai/video-understanding': {
    input: zVideoUnderstandingInput,
    output: zVideoUnderstandingOutput,
  },
  'fal-ai/x-ailab/nsfw': { input: zXAilabNsfwInput, output: zXAilabNsfwOutput },
  'openrouter/router/vision': {
    input: zRouterVisionInput,
    output: zRouterVisionOutput,
  },
  'perceptron/isaac-01': { input: zIsaac01Input, output: zIsaac01Output },
  'perceptron/isaac-01/openai/v1/chat/completions': {
    input: zIsaac01OpenaiV1ChatCompletionsInput,
    output: zIsaac01OpenaiV1ChatCompletionsOutput,
  },
}

/** Union of valid fal-vision endpoint ids. */
export type FalVisionEndpointId = keyof typeof falVisionEndpointZodMap
