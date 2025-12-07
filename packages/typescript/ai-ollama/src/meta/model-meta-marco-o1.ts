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

const MARCO_O1_LATEST = {
  name: 'marco-o1:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.7gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const MARCO_O1_7b = {
  name: 'marco-o1:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.7gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

export const MARCO_O1_MODELS = [MARCO_O1_LATEST.name, MARCO_O1_7b.name] as const

const MARCO_O1_IMAGE_MODELS = [] as const

export const MARCO_O1_EMBEDDING_MODELS = [] as const

const MARCO_O1_AUDIO_MODELS = [] as const

const MARCO_O1_VIDEO_MODELS = [] as const

// export type MarcoO1ChatModels = (typeof MARCO_O1_MODELS)[number]

// Manual type map for per-model provider options
export type MarcoO1ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [MARCO_O1_LATEST.name]: ChatRequest
  [MARCO_O1_7b.name]: ChatRequest
}

export type MarcoO1ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [MARCO_O1_LATEST.name]: typeof MARCO_O1_LATEST.supports.input
  [MARCO_O1_7b.name]: typeof MARCO_O1_7b.supports.input
}
