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

const QWQ_LATEST = {
  name: 'qwq:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '20gb',
  context: 40_000,
} as const satisfies ModelMeta<any>

const QWQ_32b = {
  name: 'qwq:32b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '20gb',
  context: 40_000,
} as const satisfies ModelMeta<any>

export const QWQ_MODELS = [QWQ_LATEST.name, QWQ_32b.name] as const

const QWQ_IMAGE_MODELS = [] as const

export const QWQ_EMBEDDING_MODELS = [] as const

const QWQ_AUDIO_MODELS = [] as const

const QWQ_VIDEO_MODELS = [] as const

// export type QwqChatModels = (typeof QWQ_MODELS)[number]

// Manual type map for per-model provider options
export type QwqChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [QWQ_LATEST.name]: ChatRequest
  [QWQ_32b.name]: ChatRequest
}

export type QwqModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [QWQ_LATEST.name]: typeof QWQ_LATEST.supports.input
  [QWQ_32b.name]: typeof QWQ_32b.supports.input
}
