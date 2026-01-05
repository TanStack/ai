import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaMessageImages,
  OllamaModelMeta,
} from './models-meta'

const LLAVA_LATEST = {
  name: 'llava:latest',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '4.7gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

const LLAVA_7b = {
  name: 'llava:7b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '4.7gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

const LLAVA_13b = {
  name: 'llava:13b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '8gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

const LLAVA_34b = {
  name: 'llava:34b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '20gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

export const LLAVA_MODELS = [
  LLAVA_LATEST.name,
  LLAVA_7b.name,
  LLAVA_13b.name,
  LLAVA_34b.name,
] as const

// const LLAVA_IMAGE_MODELS = [] as const

// export const LLAVA_EMBEDDING_MODELS = [] as const

// const LLAVA_AUDIO_MODELS = [] as const

// const LLAVA_VIDEO_MODELS = [] as const

// export type LlavaChatModels = (typeof LLAVA_MODELS)[number]

// Manual type map for per-model provider options
export type LlavaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAVA_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>

  [LLAVA_7b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>

  [LLAVA_13b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>

  [LLAVA_34b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
}

export type LlavaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAVA_LATEST.name]: typeof LLAVA_LATEST.supports.input
  [LLAVA_7b.name]: typeof LLAVA_7b.supports.input
  [LLAVA_13b.name]: typeof LLAVA_13b.supports.input
  [LLAVA_34b.name]: typeof LLAVA_34b.supports.input
}
