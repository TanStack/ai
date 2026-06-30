import type { TwelveLabsTextProviderOptions } from './text/text-provider-options'

interface ModelMeta<TProviderOptions = unknown> {
  name: string
  supports: {
    input: Array<'text' | 'image' | 'audio' | 'video' | 'document'>
    output: Array<'text' | 'image' | 'audio' | 'video'>
    capabilities?: Array<'structured_output' | 'video_understanding'>
  }
  max_output_tokens?: number
  /** Type-level description of which provider options this model supports. */
  providerOptions?: TProviderOptions
}

const PEGASUS_1_5 = {
  name: 'pegasus1.5',
  max_output_tokens: 98_304,
  supports: {
    input: ['text', 'video'],
    output: ['text'],
    capabilities: ['structured_output', 'video_understanding'],
  },
} as const satisfies ModelMeta<TwelveLabsTextProviderOptions>

const PEGASUS_1_2 = {
  name: 'pegasus1.2',
  max_output_tokens: 4_096,
  supports: {
    input: ['text', 'video'],
    output: ['text'],
    capabilities: ['structured_output', 'video_understanding'],
  },
} as const satisfies ModelMeta<TwelveLabsTextProviderOptions>

/**
 * TwelveLabs Pegasus chat / video-understanding models. Use with
 * {@link createTwelveLabsText} / `twelvelabsText` and the `chat()` /
 * `summarize()` activities.
 */
export const TWELVELABS_CHAT_MODELS = [
  PEGASUS_1_5.name,
  PEGASUS_1_2.name,
] as const

/**
 * TwelveLabs Marengo multimodal embedding models. Marengo produces 512-dim
 * embeddings for text, image, audio, and video over a single shared space.
 */
export const TWELVELABS_EMBEDDING_MODELS = ['marengo3.0'] as const

export type TwelveLabsChatModel = (typeof TWELVELABS_CHAT_MODELS)[number]
export type TwelveLabsEmbeddingModel =
  (typeof TWELVELABS_EMBEDDING_MODELS)[number]

/**
 * Per-model provider-option resolution. Both Pegasus models accept the same
 * option surface today; the map keeps the door open for per-model divergence.
 */
export interface TwelveLabsChatModelProviderOptionsByName {
  'pegasus1.5': TwelveLabsTextProviderOptions
  'pegasus1.2': TwelveLabsTextProviderOptions
}

export interface TwelveLabsModelInputModalitiesByName {
  'pegasus1.5': readonly ['text', 'video']
  'pegasus1.2': readonly ['text', 'video']
}
