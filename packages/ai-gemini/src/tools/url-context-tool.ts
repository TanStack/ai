import { brandProviderTool } from '@tanstack/ai'
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
  return brandProviderTool<GeminiUrlContextTool>({
    name: 'url_context',
    description: '',
    metadata: {},
  })
}
