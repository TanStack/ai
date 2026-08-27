import { GEMINI_INTERACTIONS_VIDEO_MODELS } from '../model-meta'
import type { DurationOptions } from '@tanstack/ai/adapters'
import type { GenerateVideosConfig, Interactions } from '@google/genai'
import type { GEMINI_VIDEO_MODELS } from '../model-meta'

export type GeminiVideoModel = (typeof GEMINI_VIDEO_MODELS)[number]

export type GeminiInteractionsVideoModel =
  (typeof GEMINI_INTERACTIONS_VIDEO_MODELS)[number]

export function isInteractionsVideoModel(
  model: GeminiVideoModel,
): model is GeminiInteractionsVideoModel {
  return (GEMINI_INTERACTIONS_VIDEO_MODELS as ReadonlyArray<string>).includes(
    model,
  )
}

export type GeminiVideoSize = '16:9' | '9:16'

export type GeminiVideoProviderOptions = Omit<
  GenerateVideosConfig,
  | 'durationSeconds'
  | 'aspectRatio'
  | 'lastFrame'
  | 'referenceImages'
  | 'httpOptions'
  | 'abortSignal'
>

export type GeminiOmniVideoProviderOptions = Omit<
  Interactions.CreateModelInteractionParamsNonStreaming,
  | 'model'
  | 'input'
  | 'stream'
  | 'background'
  | 'response_modalities'
  | 'response_format'
  | 'response_mime_type'
  | 'tools'
>

export type GeminiVideoModelProviderOptionsByName = {
  [TModel in GeminiVideoModel]: TModel extends GeminiInteractionsVideoModel
    ? GeminiOmniVideoProviderOptions
    : GeminiVideoProviderOptions
}

export type GeminiVideoModelSizeByName = {
  [TModel in GeminiVideoModel]: GeminiVideoSize
}

export type GeminiVideoModelInputModalitiesByName = {
  [TModel in GeminiVideoModel]: TModel extends GeminiInteractionsVideoModel
    ? readonly ['image', 'video']
    : readonly ['image']
}

export type GeminiVideoModelDurationByName = {
  'veo-3.1-generate-preview': 4 | 6 | 8
  'veo-3.1-fast-generate-preview': 4 | 6 | 8
  'veo-3.1-lite-generate-preview': 4 | 6 | 8
  'gemini-omni-flash-preview': number
}

export const GEMINI_VIDEO_DURATIONS: {
  readonly [TModel in GeminiVideoModel]: DurationOptions<
    GeminiVideoModelDurationByName[TModel]
  >
} = {
  'veo-3.1-generate-preview': { kind: 'discrete', values: [4, 6, 8] },
  'veo-3.1-fast-generate-preview': { kind: 'discrete', values: [4, 6, 8] },
  'veo-3.1-lite-generate-preview': { kind: 'discrete', values: [4, 6, 8] },
  'gemini-omni-flash-preview': {
    kind: 'range',
    min: 3,
    max: 10,
    unit: 'seconds',
  },
}

export function getGeminiVideoDurationOptions<TModel extends GeminiVideoModel>(
  model: TModel,
): DurationOptions<GeminiVideoModelDurationByName[TModel]> {
  return GEMINI_VIDEO_DURATIONS[model]
}
