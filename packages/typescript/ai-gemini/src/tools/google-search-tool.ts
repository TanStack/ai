import type { GoogleSearch } from '@google/genai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type GoogleSearchToolConfig = GoogleSearch

/** @deprecated Renamed to `GoogleSearchToolConfig`. Will be removed in a future release. */
export type GoogleSearchTool = GoogleSearchToolConfig

export type GeminiGoogleSearchTool = ProviderTool<'gemini', 'google_search'>

export function convertGoogleSearchToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as GoogleSearchToolConfig
  return {
    googleSearch: metadata,
  }
}

export function googleSearchTool(
  config?: GoogleSearchToolConfig,
): GeminiGoogleSearchTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'google_search',
    description: '',
    metadata: config,
  } as unknown as GeminiGoogleSearchTool
}
