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
  GeminiAudioModel,
  GeminiEmbeddingModel,
  GeminiImageModel,
  GeminiTTSModels,
  GeminiTextModel,
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

function createVertex(config: VertexClientConfig = {}) {
  const resolved = resolveVertexGeminiOptions(config)
  return {
    text<TModel extends GeminiTextModel>(model: TModel) {
      return new GeminiTextAdapter(resolved, model)
    },
    summarize<TModel extends GeminiTextModel>(model: TModel) {
      return new ChatStreamSummarizeAdapter(
        new GeminiTextAdapter(resolved, model),
        model,
        'gemini',
      )
    },
    image<TModel extends GeminiImageModel>(model: TModel) {
      return new GeminiImageAdapter(resolved, model)
    },
    embedding<TModel extends GeminiEmbeddingModel>(model: TModel) {
      return new GeminiEmbeddingAdapter(resolved, model)
    },
    speech<TModel extends GeminiTTSModel>(model: TModel) {
      return new GeminiTTSAdapter(resolved, model)
    },
    audio<TModel extends GeminiAudioModel>(model: TModel) {
      return new GeminiAudioAdapter(resolved, model)
    },
    video<TModel extends GeminiVideoModel>(
      model: TModel,
      videoConfig?: Pick<VertexVideoConfig, 'allowUrlFetch'>,
    ) {
      return new GeminiVideoAdapter(
        { ...resolved, allowUrlFetch: videoConfig?.allowUrlFetch },
        model,
      )
    },
  }
}

export function vertexText<TModel extends GeminiTextModel>(
  model: TModel,
  config: VertexClientConfig = {},
): GeminiTextAdapter<TModel> {
  return createVertex(config).text(model)
}

export function vertexSummarize<TModel extends GeminiTextModel>(
  model: TModel,
  config: VertexClientConfig = {},
): ChatStreamSummarizeAdapter<TModel> {
  return createVertex(config).summarize(model)
}

export function vertexImage<TModel extends GeminiImageModel>(
  model: TModel,
  config: VertexClientConfig = {},
): GeminiImageAdapter<TModel> {
  return createVertex(config).image(model)
}

export function vertexEmbedding<TModel extends GeminiEmbeddingModel>(
  model: TModel,
  config: VertexClientConfig = {},
): GeminiEmbeddingAdapter<TModel> {
  return createVertex(config).embedding(model)
}

export function vertexSpeech<TModel extends GeminiTTSModel>(
  model: TModel,
  config: VertexClientConfig = {},
): GeminiTTSAdapter<TModel> {
  return createVertex(config).speech(model)
}

export function vertexAudio<TModel extends GeminiAudioModel>(
  model: TModel,
  config: VertexClientConfig = {},
): GeminiAudioAdapter<TModel> {
  return createVertex(config).audio(model)
}

export function vertexVideo<TModel extends GeminiVideoModel>(
  model: TModel,
  config: VertexVideoConfig = {},
): GeminiVideoAdapter<TModel> {
  const { allowUrlFetch, ...client } = config
  return createVertex(client).video(model, { allowUrlFetch })
}
