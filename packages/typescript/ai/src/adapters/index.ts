// Base chat adapter
import type { ChatAdapter } from './base-chat-adapter'
import type { EmbeddingAdapter } from './base-embedding-adapter'
import type { SummarizeAdapter } from './base-summarize-adapter'

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

// Union type of all adapter kinds
export type AdapterKind = 'chat' | 'embedding' | 'summarize'

// Union type of all adapters
export type AnyAdapter =
  | ChatAdapter<any, any, any, any, any>
  | EmbeddingAdapter<any, any>
  | SummarizeAdapter<any, any>
