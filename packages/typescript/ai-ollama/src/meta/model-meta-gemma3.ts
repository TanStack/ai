import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaMessageImages,
  OllamaModelMeta,
} from './models-meta'

const GEMMA3_LATEST = {
  name: 'gemma3:latest',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: [],
  },
  size: '3.3gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

const GEMMA3_270m = {
  name: 'gemma3:270m',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '298mb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

const GEMMA3_1b = {
  name: 'gemma3:1b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '815mb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

const GEMMA3_4b = {
  name: 'gemma3:4b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: [],
  },
  size: '3.3gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

const GEMMA3_12b = {
  name: 'gemma3:12b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: [],
  },
  size: '8.1gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

const GEMMA3_27b = {
  name: 'gemma3:27b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: [],
  },
  size: '17gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

export const GEMMA3_MODELS = [
  GEMMA3_LATEST.name,
  GEMMA3_270m.name,
  GEMMA3_1b.name,
  GEMMA3_4b.name,
  GEMMA3_12b.name,
  GEMMA3_27b.name,
] as const

// const GEMMA3_IMAGE_MODELS = [] as const

// export const GEMMA3_EMBEDDING_MODELS = [] as const

// const GEMMA3_AUDIO_MODELS = [] as const

// const GEMMA3_VIDEO_MODELS = [] as const

// export type Gemma3ChatModels = (typeof GEMMA3_MODELS)[number]

// Manual type map for per-model provider options
export type Gemma3ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [GEMMA3_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
  [GEMMA3_270m.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
  [GEMMA3_1b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
  [GEMMA3_4b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
  [GEMMA3_12b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
  [GEMMA3_27b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
}

export type Gemma3ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [GEMMA3_LATEST.name]: typeof GEMMA3_LATEST.supports.input
  [GEMMA3_270m.name]: typeof GEMMA3_270m.supports.input
  [GEMMA3_1b.name]: typeof GEMMA3_1b.supports.input
  [GEMMA3_4b.name]: typeof GEMMA3_4b.supports.input
  [GEMMA3_12b.name]: typeof GEMMA3_12b.supports.input
  [GEMMA3_27b.name]: typeof GEMMA3_27b.supports.input
}
