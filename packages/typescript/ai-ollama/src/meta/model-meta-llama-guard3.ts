import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const LLAMA_GUARD3_LATEST = {
  name: 'llama-guard3:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.9gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const LLAMA_GUARD3_1b = {
  name: 'llama-guard3:1b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.6gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const LLAMA_GUARD3_8b = {
  name: 'llama-guard3:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.9gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const LLAMA_GUARD3_MODELS = [
  LLAMA_GUARD3_LATEST.name,
  LLAMA_GUARD3_1b.name,
  LLAMA_GUARD3_8b.name,
] as const

// const LLAMA_GUARD3_IMAGE_MODELS = [] as const

// export const LLAMA_GUARD3_EMBEDDING_MODELS = [] as const

// const LLAMA_GUARD3_AUDIO_MODELS = [] as const

// const LLAMA_GUARD3_VIDEO_MODELS = [] as const

// export type LlamaGuard3ChatModels = (typeof LLAMA_GUARD3_MODELS)[number]

// Manual type map for per-model provider options
export type LlamaGuard3ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAMA_GUARD3_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [LLAMA_GUARD3_1b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [LLAMA_GUARD3_8b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type LlamaGuard3ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAMA_GUARD3_LATEST.name]: typeof LLAMA_GUARD3_LATEST.supports.input
  [LLAMA_GUARD3_1b.name]: typeof LLAMA_GUARD3_1b.supports.input
  [LLAMA_GUARD3_8b.name]: typeof LLAMA_GUARD3_8b.supports.input
}
