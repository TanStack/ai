// Base chat adapter
import type { ChatAdapter } from './base-chat-adapter'
import type { EmbeddingAdapter } from './base-embedding-adapter'
import type { SummarizeAdapter } from './base-summarize-adapter'
import type { ImageAdapter } from './base-image-adapter'

export {
  BaseChatAdapter,
  type ChatAdapter,
  type ChatAdapterConfig,
} from './base-chat-adapter'

// Base embedding adapter
export {
  BaseEmbeddingAdapter,
  type EmbeddingAdapter,
  type EmbeddingAdapterConfig,
} from './base-embedding-adapter'

// Base summarize adapter
export {
  BaseSummarizeAdapter,
  type SummarizeAdapter,
  type SummarizeAdapterConfig,
} from './base-summarize-adapter'

// Base image adapter
export {
  BaseImageAdapter,
  type ImageAdapter,
  type ImageAdapterConfig,
} from './base-image-adapter'

// Union type of all adapter kinds
export type AdapterKind = 'chat' | 'embedding' | 'summarize' | 'image'

// Union type of all adapters
export type AnyAdapter =
  | ChatAdapter<any, any, any, any, any>
  | EmbeddingAdapter<any, any>
  | SummarizeAdapter<any, any>
  | ImageAdapter<any, any, any>
