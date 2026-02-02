// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaAiDetectorDetectImageInput,
  zSchemaAiDetectorDetectImageOutput,
  zSchemaArbiterImageImageInput,
  zSchemaArbiterImageImageOutput,
  zSchemaArbiterImageInput,
  zSchemaArbiterImageOutput,
  zSchemaArbiterImageTextInput,
  zSchemaArbiterImageTextOutput,
  zSchemaFlorence2LargeCaptionInput,
  zSchemaFlorence2LargeCaptionOutput,
  zSchemaFlorence2LargeDetailedCaptionInput,
  zSchemaFlorence2LargeDetailedCaptionOutput,
  zSchemaFlorence2LargeMoreDetailedCaptionInput,
  zSchemaFlorence2LargeMoreDetailedCaptionOutput,
  zSchemaFlorence2LargeOcrInput,
  zSchemaFlorence2LargeOcrOutput,
  zSchemaFlorence2LargeRegionToCategoryInput,
  zSchemaFlorence2LargeRegionToCategoryOutput,
  zSchemaFlorence2LargeRegionToDescriptionInput,
  zSchemaFlorence2LargeRegionToDescriptionOutput,
  zSchemaGotOcrV2Input,
  zSchemaGotOcrV2Output,
  zSchemaImageutilsNsfwInput,
  zSchemaImageutilsNsfwOutput,
  zSchemaIsaac01Input,
  zSchemaIsaac01OpenaiV1ChatCompletionsInput,
  zSchemaIsaac01OpenaiV1ChatCompletionsOutput,
  zSchemaIsaac01Output,
  zSchemaLlavaNextInput,
  zSchemaLlavaNextOutput,
  zSchemaMoondream2Input,
  zSchemaMoondream2ObjectDetectionInput,
  zSchemaMoondream2ObjectDetectionOutput,
  zSchemaMoondream2Output,
  zSchemaMoondream2PointObjectDetectionInput,
  zSchemaMoondream2PointObjectDetectionOutput,
  zSchemaMoondream2VisualQueryInput,
  zSchemaMoondream2VisualQueryOutput,
  zSchemaMoondream3PreviewCaptionInput,
  zSchemaMoondream3PreviewCaptionOutput,
  zSchemaMoondream3PreviewDetectInput,
  zSchemaMoondream3PreviewDetectOutput,
  zSchemaMoondream3PreviewPointInput,
  zSchemaMoondream3PreviewPointOutput,
  zSchemaMoondream3PreviewQueryInput,
  zSchemaMoondream3PreviewQueryOutput,
  zSchemaMoondreamBatchedInput,
  zSchemaMoondreamBatchedOutput,
  zSchemaMoondreamNextBatchInput,
  zSchemaMoondreamNextBatchOutput,
  zSchemaMoondreamNextInput,
  zSchemaMoondreamNextOutput,
  zSchemaRouterVisionInput,
  zSchemaRouterVisionOutput,
  zSchemaSa2Va4bImageInput,
  zSchemaSa2Va4bImageOutput,
  zSchemaSa2Va4bVideoInput,
  zSchemaSa2Va4bVideoOutput,
  zSchemaSa2Va8bImageInput,
  zSchemaSa2Va8bImageOutput,
  zSchemaSa2Va8bVideoInput,
  zSchemaSa2Va8bVideoOutput,
  zSchemaSam3ImageEmbedInput,
  zSchemaSam3ImageEmbedOutput,
  zSchemaVideoUnderstandingInput,
  zSchemaVideoUnderstandingOutput,
  zSchemaXAilabNsfwInput,
  zSchemaXAilabNsfwOutput,
} from './zod.gen'
import type { z } from 'zod'

import type {
  SchemaAiDetectorDetectImageInput,
  SchemaAiDetectorDetectImageOutput,
  SchemaArbiterImageImageInput,
  SchemaArbiterImageImageOutput,
  SchemaArbiterImageInput,
  SchemaArbiterImageOutput,
  SchemaArbiterImageTextInput,
  SchemaArbiterImageTextOutput,
  SchemaFlorence2LargeCaptionInput,
  SchemaFlorence2LargeCaptionOutput,
  SchemaFlorence2LargeDetailedCaptionInput,
  SchemaFlorence2LargeDetailedCaptionOutput,
  SchemaFlorence2LargeMoreDetailedCaptionInput,
  SchemaFlorence2LargeMoreDetailedCaptionOutput,
  SchemaFlorence2LargeOcrInput,
  SchemaFlorence2LargeOcrOutput,
  SchemaFlorence2LargeRegionToCategoryInput,
  SchemaFlorence2LargeRegionToCategoryOutput,
  SchemaFlorence2LargeRegionToDescriptionInput,
  SchemaFlorence2LargeRegionToDescriptionOutput,
  SchemaGotOcrV2Input,
  SchemaGotOcrV2Output,
  SchemaImageutilsNsfwInput,
  SchemaImageutilsNsfwOutput,
  SchemaIsaac01Input,
  SchemaIsaac01OpenaiV1ChatCompletionsInput,
  SchemaIsaac01OpenaiV1ChatCompletionsOutput,
  SchemaIsaac01Output,
  SchemaLlavaNextInput,
  SchemaLlavaNextOutput,
  SchemaMoondream2Input,
  SchemaMoondream2ObjectDetectionInput,
  SchemaMoondream2ObjectDetectionOutput,
  SchemaMoondream2Output,
  SchemaMoondream2PointObjectDetectionInput,
  SchemaMoondream2PointObjectDetectionOutput,
  SchemaMoondream2VisualQueryInput,
  SchemaMoondream2VisualQueryOutput,
  SchemaMoondream3PreviewCaptionInput,
  SchemaMoondream3PreviewCaptionOutput,
  SchemaMoondream3PreviewDetectInput,
  SchemaMoondream3PreviewDetectOutput,
  SchemaMoondream3PreviewPointInput,
  SchemaMoondream3PreviewPointOutput,
  SchemaMoondream3PreviewQueryInput,
  SchemaMoondream3PreviewQueryOutput,
  SchemaMoondreamBatchedInput,
  SchemaMoondreamBatchedOutput,
  SchemaMoondreamNextBatchInput,
  SchemaMoondreamNextBatchOutput,
  SchemaMoondreamNextInput,
  SchemaMoondreamNextOutput,
  SchemaRouterVisionInput,
  SchemaRouterVisionOutput,
  SchemaSa2Va4bImageInput,
  SchemaSa2Va4bImageOutput,
  SchemaSa2Va4bVideoInput,
  SchemaSa2Va4bVideoOutput,
  SchemaSa2Va8bImageInput,
  SchemaSa2Va8bImageOutput,
  SchemaSa2Va8bVideoInput,
  SchemaSa2Va8bVideoOutput,
  SchemaSam3ImageEmbedInput,
  SchemaSam3ImageEmbedOutput,
  SchemaVideoUnderstandingInput,
  SchemaVideoUnderstandingOutput,
  SchemaXAilabNsfwInput,
  SchemaXAilabNsfwOutput,
} from './types.gen'

export type VisionEndpointMap = {
  'fal-ai/arbiter/image/text': {
    input: SchemaArbiterImageTextInput
    output: SchemaArbiterImageTextOutput
  }
  'fal-ai/arbiter/image/image': {
    input: SchemaArbiterImageImageInput
    output: SchemaArbiterImageImageOutput
  }
  'fal-ai/arbiter/image': {
    input: SchemaArbiterImageInput
    output: SchemaArbiterImageOutput
  }
  'half-moon-ai/ai-detector/detect-image': {
    input: SchemaAiDetectorDetectImageInput
    output: SchemaAiDetectorDetectImageOutput
  }
  'fal-ai/sam-3/image/embed': {
    input: SchemaSam3ImageEmbedInput
    output: SchemaSam3ImageEmbedOutput
  }
  'openrouter/router/vision': {
    input: SchemaRouterVisionInput
    output: SchemaRouterVisionOutput
  }
  'fal-ai/moondream3-preview/detect': {
    input: SchemaMoondream3PreviewDetectInput
    output: SchemaMoondream3PreviewDetectOutput
  }
  'fal-ai/moondream3-preview/point': {
    input: SchemaMoondream3PreviewPointInput
    output: SchemaMoondream3PreviewPointOutput
  }
  'fal-ai/moondream3-preview/query': {
    input: SchemaMoondream3PreviewQueryInput
    output: SchemaMoondream3PreviewQueryOutput
  }
  'fal-ai/moondream3-preview/caption': {
    input: SchemaMoondream3PreviewCaptionInput
    output: SchemaMoondream3PreviewCaptionOutput
  }
  'perceptron/isaac-01/openai/v1/chat/completions': {
    input: SchemaIsaac01OpenaiV1ChatCompletionsInput
    output: SchemaIsaac01OpenaiV1ChatCompletionsOutput
  }
  'perceptron/isaac-01': {
    input: SchemaIsaac01Input
    output: SchemaIsaac01Output
  }
  'fal-ai/x-ailab/nsfw': {
    input: SchemaXAilabNsfwInput
    output: SchemaXAilabNsfwOutput
  }
  'fal-ai/video-understanding': {
    input: SchemaVideoUnderstandingInput
    output: SchemaVideoUnderstandingOutput
  }
  'fal-ai/moondream2/visual-query': {
    input: SchemaMoondream2VisualQueryInput
    output: SchemaMoondream2VisualQueryOutput
  }
  'fal-ai/moondream2': {
    input: SchemaMoondream2Input
    output: SchemaMoondream2Output
  }
  'fal-ai/moondream2/point-object-detection': {
    input: SchemaMoondream2PointObjectDetectionInput
    output: SchemaMoondream2PointObjectDetectionOutput
  }
  'fal-ai/moondream2/object-detection': {
    input: SchemaMoondream2ObjectDetectionInput
    output: SchemaMoondream2ObjectDetectionOutput
  }
  'fal-ai/got-ocr/v2': {
    input: SchemaGotOcrV2Input
    output: SchemaGotOcrV2Output
  }
  'fal-ai/moondream-next/batch': {
    input: SchemaMoondreamNextBatchInput
    output: SchemaMoondreamNextBatchOutput
  }
  'fal-ai/sa2va/4b/video': {
    input: SchemaSa2Va4bVideoInput
    output: SchemaSa2Va4bVideoOutput
  }
  'fal-ai/sa2va/8b/video': {
    input: SchemaSa2Va8bVideoInput
    output: SchemaSa2Va8bVideoOutput
  }
  'fal-ai/sa2va/4b/image': {
    input: SchemaSa2Va4bImageInput
    output: SchemaSa2Va4bImageOutput
  }
  'fal-ai/sa2va/8b/image': {
    input: SchemaSa2Va8bImageInput
    output: SchemaSa2Va8bImageOutput
  }
  'fal-ai/moondream-next': {
    input: SchemaMoondreamNextInput
    output: SchemaMoondreamNextOutput
  }
  'fal-ai/florence-2-large/region-to-description': {
    input: SchemaFlorence2LargeRegionToDescriptionInput
    output: SchemaFlorence2LargeRegionToDescriptionOutput
  }
  'fal-ai/florence-2-large/ocr': {
    input: SchemaFlorence2LargeOcrInput
    output: SchemaFlorence2LargeOcrOutput
  }
  'fal-ai/florence-2-large/more-detailed-caption': {
    input: SchemaFlorence2LargeMoreDetailedCaptionInput
    output: SchemaFlorence2LargeMoreDetailedCaptionOutput
  }
  'fal-ai/florence-2-large/region-to-category': {
    input: SchemaFlorence2LargeRegionToCategoryInput
    output: SchemaFlorence2LargeRegionToCategoryOutput
  }
  'fal-ai/florence-2-large/caption': {
    input: SchemaFlorence2LargeCaptionInput
    output: SchemaFlorence2LargeCaptionOutput
  }
  'fal-ai/florence-2-large/detailed-caption': {
    input: SchemaFlorence2LargeDetailedCaptionInput
    output: SchemaFlorence2LargeDetailedCaptionOutput
  }
  'fal-ai/imageutils/nsfw': {
    input: SchemaImageutilsNsfwInput
    output: SchemaImageutilsNsfwOutput
  }
  'fal-ai/moondream/batched': {
    input: SchemaMoondreamBatchedInput
    output: SchemaMoondreamBatchedOutput
  }
  'fal-ai/llava-next': {
    input: SchemaLlavaNextInput
    output: SchemaLlavaNextOutput
  }
}

/** Union type of all vision model endpoint IDs */
export type VisionModel = keyof VisionEndpointMap

export const VisionSchemaMap: Record<
  VisionModel,
  {
    input: z.ZodSchema<VisionModelInput<VisionModel>>
    output: z.ZodSchema<VisionModelOutput<VisionModel>>
  }
> = {
  ['fal-ai/arbiter/image/text']: {
    input: zSchemaArbiterImageTextInput,
    output: zSchemaArbiterImageTextOutput,
  },
  ['fal-ai/arbiter/image/image']: {
    input: zSchemaArbiterImageImageInput,
    output: zSchemaArbiterImageImageOutput,
  },
  ['fal-ai/arbiter/image']: {
    input: zSchemaArbiterImageInput,
    output: zSchemaArbiterImageOutput,
  },
  ['half-moon-ai/ai-detector/detect-image']: {
    input: zSchemaAiDetectorDetectImageInput,
    output: zSchemaAiDetectorDetectImageOutput,
  },
  ['fal-ai/sam-3/image/embed']: {
    input: zSchemaSam3ImageEmbedInput,
    output: zSchemaSam3ImageEmbedOutput,
  },
  ['openrouter/router/vision']: {
    input: zSchemaRouterVisionInput,
    output: zSchemaRouterVisionOutput,
  },
  ['fal-ai/moondream3-preview/detect']: {
    input: zSchemaMoondream3PreviewDetectInput,
    output: zSchemaMoondream3PreviewDetectOutput,
  },
  ['fal-ai/moondream3-preview/point']: {
    input: zSchemaMoondream3PreviewPointInput,
    output: zSchemaMoondream3PreviewPointOutput,
  },
  ['fal-ai/moondream3-preview/query']: {
    input: zSchemaMoondream3PreviewQueryInput,
    output: zSchemaMoondream3PreviewQueryOutput,
  },
  ['fal-ai/moondream3-preview/caption']: {
    input: zSchemaMoondream3PreviewCaptionInput,
    output: zSchemaMoondream3PreviewCaptionOutput,
  },
  ['perceptron/isaac-01/openai/v1/chat/completions']: {
    input: zSchemaIsaac01OpenaiV1ChatCompletionsInput,
    output: zSchemaIsaac01OpenaiV1ChatCompletionsOutput,
  },
  ['perceptron/isaac-01']: {
    input: zSchemaIsaac01Input,
    output: zSchemaIsaac01Output,
  },
  ['fal-ai/x-ailab/nsfw']: {
    input: zSchemaXAilabNsfwInput,
    output: zSchemaXAilabNsfwOutput,
  },
  ['fal-ai/video-understanding']: {
    input: zSchemaVideoUnderstandingInput,
    output: zSchemaVideoUnderstandingOutput,
  },
  ['fal-ai/moondream2/visual-query']: {
    input: zSchemaMoondream2VisualQueryInput,
    output: zSchemaMoondream2VisualQueryOutput,
  },
  ['fal-ai/moondream2']: {
    input: zSchemaMoondream2Input,
    output: zSchemaMoondream2Output,
  },
  ['fal-ai/moondream2/point-object-detection']: {
    input: zSchemaMoondream2PointObjectDetectionInput,
    output: zSchemaMoondream2PointObjectDetectionOutput,
  },
  ['fal-ai/moondream2/object-detection']: {
    input: zSchemaMoondream2ObjectDetectionInput,
    output: zSchemaMoondream2ObjectDetectionOutput,
  },
  ['fal-ai/got-ocr/v2']: {
    input: zSchemaGotOcrV2Input,
    output: zSchemaGotOcrV2Output,
  },
  ['fal-ai/moondream-next/batch']: {
    input: zSchemaMoondreamNextBatchInput,
    output: zSchemaMoondreamNextBatchOutput,
  },
  ['fal-ai/sa2va/4b/video']: {
    input: zSchemaSa2Va4bVideoInput,
    output: zSchemaSa2Va4bVideoOutput,
  },
  ['fal-ai/sa2va/8b/video']: {
    input: zSchemaSa2Va8bVideoInput,
    output: zSchemaSa2Va8bVideoOutput,
  },
  ['fal-ai/sa2va/4b/image']: {
    input: zSchemaSa2Va4bImageInput,
    output: zSchemaSa2Va4bImageOutput,
  },
  ['fal-ai/sa2va/8b/image']: {
    input: zSchemaSa2Va8bImageInput,
    output: zSchemaSa2Va8bImageOutput,
  },
  ['fal-ai/moondream-next']: {
    input: zSchemaMoondreamNextInput,
    output: zSchemaMoondreamNextOutput,
  },
  ['fal-ai/florence-2-large/region-to-description']: {
    input: zSchemaFlorence2LargeRegionToDescriptionInput,
    output: zSchemaFlorence2LargeRegionToDescriptionOutput,
  },
  ['fal-ai/florence-2-large/ocr']: {
    input: zSchemaFlorence2LargeOcrInput,
    output: zSchemaFlorence2LargeOcrOutput,
  },
  ['fal-ai/florence-2-large/more-detailed-caption']: {
    input: zSchemaFlorence2LargeMoreDetailedCaptionInput,
    output: zSchemaFlorence2LargeMoreDetailedCaptionOutput,
  },
  ['fal-ai/florence-2-large/region-to-category']: {
    input: zSchemaFlorence2LargeRegionToCategoryInput,
    output: zSchemaFlorence2LargeRegionToCategoryOutput,
  },
  ['fal-ai/florence-2-large/caption']: {
    input: zSchemaFlorence2LargeCaptionInput,
    output: zSchemaFlorence2LargeCaptionOutput,
  },
  ['fal-ai/florence-2-large/detailed-caption']: {
    input: zSchemaFlorence2LargeDetailedCaptionInput,
    output: zSchemaFlorence2LargeDetailedCaptionOutput,
  },
  ['fal-ai/imageutils/nsfw']: {
    input: zSchemaImageutilsNsfwInput,
    output: zSchemaImageutilsNsfwOutput,
  },
  ['fal-ai/moondream/batched']: {
    input: zSchemaMoondreamBatchedInput,
    output: zSchemaMoondreamBatchedOutput,
  },
  ['fal-ai/llava-next']: {
    input: zSchemaLlavaNextInput,
    output: zSchemaLlavaNextOutput,
  },
}

/** Get the input type for a specific vision model */
export type VisionModelInput<T extends VisionModel> =
  VisionEndpointMap[T]['input']

/** Get the output type for a specific vision model */
export type VisionModelOutput<T extends VisionModel> =
  VisionEndpointMap[T]['output']
