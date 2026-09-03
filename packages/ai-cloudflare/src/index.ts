/**
 * @module @tanstack/ai-cloudflare
 *
 * Cloudflare provider adapter for TanStack AI: Workers AI chat, embeddings,
 * images, speech and transcription over the `env.AI` binding or the REST
 * API, plus AI Gateway routing for any provider.
 */

export {
  CloudflareTextAdapter,
  createCloudflareText,
  cloudflareText,
  type CloudflareTextConfig,
  type CloudflareTextProviderOptions,
} from './adapters/text'

export {
  createCloudflareSummarize,
  cloudflareSummarize,
  type CloudflareSummarizeModel,
} from './adapters/summarize'

export {
  CloudflareEmbeddingAdapter,
  createCloudflareEmbedding,
  cloudflareEmbedding,
  type CloudflareEmbeddingProviderOptions,
} from './adapters/embedding'

export {
  CloudflareImageAdapter,
  createCloudflareImage,
  cloudflareImage,
  type CloudflareImageProviderOptions,
} from './adapters/image'

export {
  CloudflareTTSAdapter,
  createCloudflareTTS,
  cloudflareTTS,
  type CloudflareTTSProviderOptions,
} from './adapters/tts'

export {
  CloudflareTranscriptionAdapter,
  createCloudflareTranscription,
  cloudflareTranscription,
  type CloudflareTranscriptionProviderOptions,
} from './adapters/transcription'

export { cloudflareGateway, type CloudflareGatewayTarget } from './gateway'

export type {
  CloudflareBindingConfig,
  CloudflareConfig,
  CloudflareGatewayOptions,
  CloudflareRestConfig,
} from './utils/config'

export type {
  CloudflareEmbeddingModel,
  CloudflareImageModel,
  CloudflareTextModel,
  CloudflareTranscriptionModel,
  CloudflareTTSModel,
} from './utils/models'
