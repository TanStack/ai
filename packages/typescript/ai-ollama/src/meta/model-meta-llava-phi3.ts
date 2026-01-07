import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaMessageImages,
  OllamaModelMeta,
} from './models-meta'

const LLAVA_PHI3_LATEST = {
  name: 'llava-phi3:latest',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '2.9gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

const LLAVA_PHI3_8b = {
  name: 'llava-phi3:8b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '2.9gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

export const LLAVA_PHI3_MODELS = [
  LLAVA_PHI3_LATEST.name,
  LLAVA_PHI3_8b.name,
] as const

// const LLAVA_PHI3_IMAGE_MODELS = [] as const

// export const LLAVA_PHI3_EMBEDDING_MODELS = [] as const

// const LLAVA_PHI3_AUDIO_MODELS = [] as const

// const LLAVA_PHI3_VIDEO_MODELS = [] as const

// export type LlavaPhi3ChatModels = (typeof LLAVA_PHI3_MODELS)[number]

// Manual type map for per-model provider options
export type LlavaPhi3ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAVA_PHI3_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
  [LLAVA_PHI3_8b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
}

export type LlavaPhi3ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAVA_PHI3_LATEST.name]: typeof LLAVA_PHI3_LATEST.supports.input
  [LLAVA_PHI3_8b.name]: typeof LLAVA_PHI3_8b.supports.input
}
