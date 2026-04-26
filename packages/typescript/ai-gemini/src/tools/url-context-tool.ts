import type { ProviderTool, Tool } from '@tanstack/ai'

export interface UrlContextToolConfig {}

/** @deprecated Renamed to `UrlContextToolConfig`. Will be removed in a future release. */
export type UrlContextTool = UrlContextToolConfig

export type GeminiUrlContextTool = ProviderTool<'gemini', 'url_context'>

export function convertUrlContextToolToAdapterFormat(_tool: Tool) {
  return {
    urlContext: {},
  }
}

export function urlContextTool(): GeminiUrlContextTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'url_context',
    description: '',
    metadata: {},
  } as unknown as GeminiUrlContextTool
}
