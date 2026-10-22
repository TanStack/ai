import { brandGeminiProviderTool } from './gemini-provider-tool'
import type { ProviderTool, Tool } from '@tanstack/ai'

export interface UrlContextToolConfig {}

export type GeminiUrlContextTool = ProviderTool<'gemini', 'url_context'>

export function convertUrlContextToolToAdapterFormat(_tool: Tool) {
  return {
    urlContext: {},
  }
}

export function urlContextTool(): GeminiUrlContextTool {
  return brandGeminiProviderTool<GeminiUrlContextTool>(
    {
      name: 'url_context',
      description: '',
      metadata: {},
    },
    'url_context',
  )
}
