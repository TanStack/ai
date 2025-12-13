import type { ChatRequest } from 'ollama'
import type { DefaultOllamaModelMeta } from './models-meta'

const LLAMA4_LATEST = {
  name: 'llama4:latest',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['tools', 'vision'],
  },
  size: '67b',
  context: 10_000_000,
} as const satisfies DefaultOllamaModelMeta<any>

const LLAMA4_16X17b = {
  name: 'llama4:16x17b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['tools', 'vision'],
  },
  size: '67gb',
  context: 10_000_000,
} as const satisfies DefaultOllamaModelMeta<any>

const LLAMA4_128X17b = {
  name: 'llama4:128x17b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['tools', 'vision'],
  },
  size: '245gb',
  context: 1_000_000,
} as const satisfies DefaultOllamaModelMeta<any>

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
export type Llama3_4ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAMA4_LATEST.name]: ChatRequest
  [LLAMA4_16X17b.name]: ChatRequest
  [LLAMA4_128X17b.name]: ChatRequest
}

export type Llama3_4ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAMA4_LATEST.name]: typeof LLAMA4_LATEST.supports.input
  [LLAMA4_16X17b.name]: typeof LLAMA4_16X17b.supports.input
  [LLAMA4_128X17b.name]: typeof LLAMA4_128X17b.supports.input
}
