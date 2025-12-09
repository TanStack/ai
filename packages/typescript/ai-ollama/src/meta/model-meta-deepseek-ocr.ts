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

const DEEPSEEK_OCR_LATEST = {
  name: 'deepseek-ocr:latest',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '6.7gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

const DEEPSEEK_OCR_3b = {
  name: 'deepseek-ocr:3b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },

  size: '6.7gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

export const DEEPSEEK_OCR_MODELS = [
  DEEPSEEK_OCR_LATEST.name,
  DEEPSEEK_OCR_3b.name,
] as const

// export const DEEPSEEK_OCR_IMAGE_MODELS = [] as const

// export const DEEPSEEK_OCR_EMBEDDING_MODELS = [] as const

// export const DEEPSEEK_OCR_AUDIO_MODELS = [] as const

// export const DEEPSEEK_OCR_VIDEO_MODELS = [] as const

// export type DeepseekOcrChatModels = (typeof DEEPSEEK_OCR__MODELS)[number]

// Manual type map for per-model provider options
export type DeepseekOcrChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [DEEPSEEK_OCR_LATEST.name]: ChatRequest
  [DEEPSEEK_OCR_3b.name]: ChatRequest
}

export type DeepseekOcrModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [DEEPSEEK_OCR_LATEST.name]: typeof DEEPSEEK_OCR_LATEST.supports.input
  [DEEPSEEK_OCR_3b.name]: typeof DEEPSEEK_OCR_3b.supports.input
}
