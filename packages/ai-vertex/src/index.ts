import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import {
  GeminiAudioAdapter,
  GeminiEmbeddingAdapter,
  GeminiImageAdapter,
  GeminiTTSAdapter,
  GeminiTextAdapter,
  GeminiVideoAdapter,
} from '@tanstack/ai-gemini'
import { resolveVertexGeminiOptions } from './auth'
import type {
  GeminiAudioConfig,
  GeminiAudioModel,
  GeminiEmbeddingConfig,
  GeminiEmbeddingModel,
  GeminiImageConfig,
  GeminiImageModel,
  GeminiTTSConfig,
  GeminiTTSModels,
  GeminiTextConfig,
  GeminiTextModel,
  GeminiVideoConfig,
  GeminiVideoModel,
} from '@tanstack/ai-gemini'
import type { VertexClientConfig, VertexVideoConfig } from './auth'

export { VertexAuthError } from './errors'
export {
  resolveVertexGeminiOptions,
  type VertexClientConfig,
  type VertexVideoConfig,
} from './auth'

type GeminiTTSModel = (typeof GeminiTTSModels)[number]

/** A Vertex factory config plus the `defaultModelOptions` of its adapter. */
type VertexAdapterConfig<
  TAdapterConfig extends { defaultModelOptions?: unknown },
> = VertexClientConfig & Pick<TAdapterConfig, 'defaultModelOptions'>

export function vertexText<TModel extends GeminiTextModel>(
  model: TModel,
  config: VertexAdapterConfig<GeminiTextConfig<TModel>> = {},
): GeminiTextAdapter<TModel> {
  const { defaultModelOptions, ...client } = config
  return new GeminiTextAdapter(
    { ...resolveVertexGeminiOptions(client), defaultModelOptions },
    model,
  )
}

export function vertexSummarize<TModel extends GeminiTextModel>(
  model: TModel,
  config: VertexAdapterConfig<GeminiTextConfig<TModel>> = {},
): ChatStreamSummarizeAdapter<
  TModel,
  NonNullable<GeminiTextConfig<TModel>['defaultModelOptions']>
> {
  const { defaultModelOptions, ...client } = config
  return new ChatStreamSummarizeAdapter(
    new GeminiTextAdapter(
      { ...resolveVertexGeminiOptions(client), defaultModelOptions },
      model,
    ),
    model,
    'gemini',
  )
}

export function vertexImage<TModel extends GeminiImageModel>(
  model: TModel,
  config: VertexAdapterConfig<GeminiImageConfig> = {},
): GeminiImageAdapter<TModel> {
  const { defaultModelOptions, ...client } = config
  return new GeminiImageAdapter(
    { ...resolveVertexGeminiOptions(client), defaultModelOptions },
    model,
  )
}

export function vertexEmbedding<TModel extends GeminiEmbeddingModel>(
  model: TModel,
  config: VertexAdapterConfig<GeminiEmbeddingConfig> = {},
): GeminiEmbeddingAdapter<TModel> {
  const { defaultModelOptions, ...client } = config
  return new GeminiEmbeddingAdapter(
    { ...resolveVertexGeminiOptions(client), defaultModelOptions },
    model,
  )
}

export function vertexSpeech<TModel extends GeminiTTSModel>(
  model: TModel,
  config: VertexAdapterConfig<GeminiTTSConfig> = {},
): GeminiTTSAdapter<TModel> {
  const { defaultModelOptions, ...client } = config
  return new GeminiTTSAdapter(
    { ...resolveVertexGeminiOptions(client), defaultModelOptions },
    model,
  )
}

export function vertexAudio<TModel extends GeminiAudioModel>(
  model: TModel,
  config: VertexAdapterConfig<GeminiAudioConfig> = {},
): GeminiAudioAdapter<TModel> {
  const { defaultModelOptions, ...client } = config
  return new GeminiAudioAdapter(
    { ...resolveVertexGeminiOptions(client), defaultModelOptions },
    model,
  )
}

export function vertexVideo<TModel extends GeminiVideoModel>(
  model: TModel,
  config: VertexVideoConfig &
    VertexAdapterConfig<GeminiVideoConfig<TModel>> = {},
): GeminiVideoAdapter<TModel> {
  const { allowUrlFetch, defaultModelOptions, ...client } = config
  return new GeminiVideoAdapter(
    {
      ...resolveVertexGeminiOptions(client),
      allowUrlFetch,
      defaultModelOptions,
    },
    model,
  )
}
