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

const CODEGEMMA_LATEST = {
  name: 'codegemma:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

const CODEGEMMA_8b = {
  name: 'codegemma:2b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.65gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

const CODEGEMMA_35b = {
  name: 'codegemma:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

export const CODEGEMMA_MODELS = [
  CODEGEMMA_LATEST.name,
  CODEGEMMA_8b.name,
  CODEGEMMA_35b.name,
] as const

// const CODEGEMMA_IMAGE_MODELS = [] as const

// export const CODEGEMMA_EMBEDDING_MODELS = [] as const

// const CODEGEMMA_AUDIO_MODELS = [] as const

// const CODEGEMMA_VIDEO_MODELS = [] as const

// export type CodegemmaChatModels = (typeof CODEGEMMA_MODELS)[number]

// Manual type map for per-model provider options
export type CodegemmaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [CODEGEMMA_LATEST.name]: ChatRequest
  [CODEGEMMA_8b.name]: ChatRequest
  [CODEGEMMA_35b.name]: ChatRequest
}

export type CodegemmaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [CODEGEMMA_LATEST.name]: typeof CODEGEMMA_LATEST.supports.input
  [CODEGEMMA_8b.name]: typeof CODEGEMMA_8b.supports.input
  [CODEGEMMA_35b.name]: typeof CODEGEMMA_35b.supports.input
}
