// Search API
export {
  PerplexitySearchClient,
  perplexitySearchTool,
  type PerplexitySearchClientConfig,
  type PerplexitySearchRequest,
  type PerplexitySearchResponse,
  type PerplexitySearchResult,
} from './search'

// OpenAI-compatible chat client (Perplexity chat completions endpoint)
export {
  createPerplexityChatClient,
  type PerplexityChatClientConfig,
} from './chat'

// Utilities
export { getPerplexityApiKeyFromEnv } from './utils/api-key'
