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

const LLAMA3_2_VISION_LATEST = {
  name: 'llama3.2:latest',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '7.8b',
  context: 128_000,
} as const satisfies ModelMeta<any>

const LLAMA3_2_VISION_11b = {
  name: 'llama3.2:11b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '1gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

const LLAMA3_2_VISION_90b = {
  name: 'llama3.2:90b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '55gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

export const LLAMA3_2_VISION_MODELS = [
  LLAMA3_2_VISION_LATEST.name,
  LLAMA3_2_VISION_11b.name,
  LLAMA3_2_VISION_90b.name,
] as const

export const LLAMA3_2_VISION_IMAGE_MODELS = [] as const

export const LLAMA3_2_VISION_EMBEDDING_MODELS = [] as const

const LLAMA3_2_VISION_AUDIO_MODELS = [] as const

const LLAMA3_2_VISION_VIDEO_MODELS = [] as const

// export type Llama3_2VisionChatModels = (typeof LLAMA3_2Vision_MODELS)[number]

// Manual type map for per-model provider options
export type Llama3_2VisionChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAMA3_2_VISION_LATEST.name]: ChatRequest
  [LLAMA3_2_VISION_11b.name]: ChatRequest
  [LLAMA3_2_VISION_90b.name]: ChatRequest
}

export type Llama3_2VisionModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAMA3_2_VISION_LATEST.name]: typeof LLAMA3_2_VISION_LATEST.supports.input
  [LLAMA3_2_VISION_11b.name]: typeof LLAMA3_2_VISION_11b.supports.input
  [LLAMA3_2_VISION_90b.name]: typeof LLAMA3_2_VISION_90b.supports.input
}
