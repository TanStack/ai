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

const PHI4_LATEST = {
  name: 'phi4:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '9.1gb',
  context: 16_000,
} as const satisfies ModelMeta<any>

const PHI4_14b = {
  name: 'phi4:14b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '9.1gb',
  context: 16_000,
} as const satisfies ModelMeta<any>

export const PHI4_MODELS = [PHI4_LATEST.name, PHI4_14b.name] as const

const PHI4_IMAGE_MODELS = [] as const

export const PHI4_EMBEDDING_MODELS = [] as const

const PHI4_AUDIO_MODELS = [] as const

const PHI4_VIDEO_MODELS = [] as const

// export type Phi4ChatModels = (typeof PHI4_MODELS)[number]

// Manual type map for per-model provider options
export type Phi4ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [PHI4_LATEST.name]: ChatRequest
  [PHI4_14b.name]: ChatRequest
}

export type Phi4ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [PHI4_LATEST.name]: typeof PHI4_LATEST.supports.input
  [PHI4_14b.name]: typeof PHI4_14b.supports.input
}
