import type { GoogleSearchRetrieval } from '@google/genai'
import type { Tool } from '@tanstack/ai'

export type GoogleSearchRetrievalTool = GoogleSearchRetrieval

export function convertGoogleSearchRetrievalToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as GoogleSearchRetrievalTool
  return {
    googleSearchRetrieval: metadata,
  }
}

export function googleSearchRetrievalTool(
  config?: GoogleSearchRetrievalTool,
): Tool {
  return {
    name: 'google_search_retrieval',
    description: '',
    metadata: config,
  }
}
