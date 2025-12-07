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

const DOLPHIN3_LATEST = {
  name: 'dolphin3:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.9gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

const DOLPHIN3_8b = {
  name: 'dolphin3:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.9gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

export const DOLPHIN3_MODELS = [DOLPHIN3_LATEST.name, DOLPHIN3_8b.name] as const

const DOLPHIN3_IMAGE_MODELS = [] as const

export const DOLPHIN3_EMBEDDING_MODELS = [] as const

const DOLPHIN3_AUDIO_MODELS = [] as const

const DOLPHIN3_VIDEO_MODELS = [] as const

// export type Dolphin3ChatModels = (typeof DOLPHIN3_MODELS)[number]

// Manual type map for per-model provider options
export type Dolphin3ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [DOLPHIN3_LATEST.name]: ChatRequest
  [DOLPHIN3_8b.name]: ChatRequest
}

export type Dolphin3ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [DOLPHIN3_LATEST.name]: typeof DOLPHIN3_LATEST.supports.input
  [DOLPHIN3_8b.name]: typeof DOLPHIN3_8b.supports.input
}
