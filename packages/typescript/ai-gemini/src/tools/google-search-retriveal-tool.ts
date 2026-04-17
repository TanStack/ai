import type { GoogleSearchRetrieval } from '@google/genai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type GoogleSearchRetrievalToolConfig = GoogleSearchRetrieval

/** @deprecated Renamed to `GoogleSearchRetrievalToolConfig`. Will be removed in a future release. */
export type GoogleSearchRetrievalTool = GoogleSearchRetrievalToolConfig

export type GeminiGoogleSearchRetrievalTool = ProviderTool<
  'gemini',
  'google_search_retrieval'
>

export function convertGoogleSearchRetrievalToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as GoogleSearchRetrievalToolConfig
  return {
    googleSearchRetrieval: metadata,
  }
}

export function googleSearchRetrievalTool(
  config?: GoogleSearchRetrievalToolConfig,
): GeminiGoogleSearchRetrievalTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'google_search_retrieval',
    description: '',
    metadata: config,
  } as unknown as GeminiGoogleSearchRetrievalTool
}
