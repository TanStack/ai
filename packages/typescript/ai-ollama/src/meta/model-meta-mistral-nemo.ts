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

const MISTRAL_NEMO_LATEST = {
  name: 'mistral-nemo:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '7.1gb',
  context: 1_000,
} as const satisfies ModelMeta<any>

const MISTRAL_NEMO_12b = {
  name: 'mistral-nemo:12b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '7.1gb',
  context: 1_000,
} as const satisfies ModelMeta<any>

export const MISTRAL_NEMO_MODELS = [
  MISTRAL_NEMO_LATEST.name,
  MISTRAL_NEMO_12b.name,
] as const

const MISTRAL_NEMO_IMAGE_MODELS = [] as const

export const MISTRAL_NEMO_EMBEDDING_MODELS = [] as const

const MISTRAL_NEMO_AUDIO_MODELS = [] as const

const MISTRAL_NEMO_VIDEO_MODELS = [] as const

// export type MistralNemoChatModels = (typeof MISTRAL_NEMO_MODELS)[number]

// Manual type map for per-model provider options
export type MistralNemoChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [MISTRAL_NEMO_LATEST.name]: ChatRequest
  [MISTRAL_NEMO_12b.name]: ChatRequest
}

export type MistralNemoModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [MISTRAL_NEMO_LATEST.name]: typeof MISTRAL_NEMO_LATEST.supports.input
  [MISTRAL_NEMO_12b.name]: typeof MISTRAL_NEMO_12b.supports.input
}
