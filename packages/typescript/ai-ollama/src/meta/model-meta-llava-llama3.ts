import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaMessageImages,
  OllamaModelMeta,
} from './models-meta'

const LLAVA_LLAMA3_LATEST = {
  name: 'llava-llama3:latest',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '5.5gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

const LLAVA_LLAMA3_8b = {
  name: 'llava-llama3:8b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '5.5gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

export const LLAVA_LLAMA3_MODELS = [
  LLAVA_LLAMA3_LATEST.name,
  LLAVA_LLAMA3_8b.name,
] as const

// const LLAVA_LLAMA3_IMAGE_MODELS = [] as const

// export const LLAVA_LLAMA3_EMBEDDING_MODELS = [] as const

// const LLAVA_LLAMA3_AUDIO_MODELS = [] as const

// const LLAVA_LLAMA3_VIDEO_MODELS = [] as const

// export type LlavaLlamaChatModels = (typeof LLAVA_LLAMA3_MODELS)[number]

// Manual type map for per-model provider options
export type LlavaLlamaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAVA_LLAMA3_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>

  [LLAVA_LLAMA3_8b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
}

export type LlavaLlamaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAVA_LLAMA3_LATEST.name]: typeof LLAVA_LLAMA3_LATEST.supports.input
  [LLAVA_LLAMA3_8b.name]: typeof LLAVA_LLAMA3_8b.supports.input
}
