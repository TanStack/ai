import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageImages,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const LLAMA4_LATEST = {
  name: 'llama4:latest',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['tools', 'vision'],
  },
  size: '67gb',
  context: 10_000_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageImages> &
    OllamaChatRequestTools
>

const LLAMA4_16X17b = {
  name: 'llama4:16x17b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['tools', 'vision'],
  },
  size: '67gb',
  context: 10_000_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageImages> &
    OllamaChatRequestTools
>

const LLAMA4_128X17b = {
  name: 'llama4:128x17b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['tools', 'vision'],
  },
  size: '245gb',
  context: 1_000_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageImages> &
    OllamaChatRequestTools
>

export const LLAMA4_MODELS = [
  LLAMA4_LATEST.name,
  LLAMA4_16X17b.name,
  LLAMA4_128X17b.name,
] as const

// const LLAMA4_IMAGE_MODELS = [] as const

// export const LLAMA4_EMBEDDING_MODELS = [] as const

// const LLAMA4_AUDIO_MODELS = [] as const

// const LLAMA4_VIDEO_MODELS = [] as const

// export type Llama3_4ChatModels = (typeof LLAMA4_MODELS)[number]

// Manual type map for per-model provider options
export type Llama4ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAMA4_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageImages> &
    OllamaChatRequestTools
  [LLAMA4_16X17b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageImages> &
    OllamaChatRequestTools
  [LLAMA4_128X17b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageImages> &
    OllamaChatRequestTools
}

export type Llama4ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAMA4_LATEST.name]: typeof LLAMA4_LATEST.supports.input
  [LLAMA4_16X17b.name]: typeof LLAMA4_16X17b.supports.input
  [LLAMA4_128X17b.name]: typeof LLAMA4_128X17b.supports.input
}
