import {
  brandGeminiProviderTool,
  getGeminiProviderToolMetadata,
} from './gemini-provider-tool'
import type { GoogleSearch } from '@google/genai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type GoogleSearchToolConfig = GoogleSearch

/** @deprecated Renamed to `GoogleSearchToolConfig`. Will be removed in a future release. */
export type GoogleSearchTool = GoogleSearchToolConfig

export type GeminiGoogleSearchTool = ProviderTool<'gemini', 'google_search'>

export function convertGoogleSearchToolToAdapterFormat(tool: Tool) {
  const metadata = getGeminiProviderToolMetadata(tool) as GoogleSearchToolConfig
  return {
    googleSearch: metadata,
  }
}

export function googleSearchTool(
  config?: GoogleSearchToolConfig,
): GeminiGoogleSearchTool {
  return brandGeminiProviderTool<GeminiGoogleSearchTool>(
    {
      name: 'google_search',
      description: '',
      metadata: config,
    },
    'google_search',
  )
}
