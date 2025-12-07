import type { ChatRequest } from 'ollama'

interface ModelMeta<TProviderOptions = unknown> {
  name: string
  providerOptions?: TProviderOptions
  supports?: {
    input?: Array<'text' | 'image' | 'video'>
    output?: Array<'text' | 'image' | 'video'>
    capabilities?: Array<'tools' | 'thinking' | 'vision' | 'embedding'>
  }
  size?: string
  context?: number
}

const LLAVA_LLAMA3_LATEST = {
  name: 'llava-llama3:latest',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '5.5b',
  context: 8_000,
} as const satisfies ModelMeta<any>

const LLAVA_LLAMA3_8b = {
  name: 'llava-llama3:8b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '5.5gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

export const LLAVA_LLAMA3_MODELS = [
  LLAVA_LLAMA3_LATEST.name,
  LLAVA_LLAMA3_8b.name,
] as const

const LLAVA_LLAMA3_IMAGE_MODELS = [] as const

export const LLAVA_LLAMA3_EMBEDDING_MODELS = [] as const

const LLAVA_LLAMA3_AUDIO_MODELS = [] as const

const LLAVA_LLAMA3_VIDEO_MODELS = [] as const

// export type LlavaLlamaChatModels = (typeof LLAVA_LLAMA3_MODELS)[number]

// Manual type map for per-model provider options
export type LlavaLlamaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAVA_LLAMA3_LATEST.name]: ChatRequest
  [LLAVA_LLAMA3_8b.name]: ChatRequest
}

export type LlavaLlamaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAVA_LLAMA3_LATEST.name]: typeof LLAVA_LLAMA3_LATEST.supports.input
  [LLAVA_LLAMA3_8b.name]: typeof LLAVA_LLAMA3_8b.supports.input
}
