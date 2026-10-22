import {
  brandGeminiProviderTool,
  getGeminiProviderToolMetadata,
} from './gemini-provider-tool'
import type { FileSearch } from '@google/genai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type FileSearchToolConfig = FileSearch

export type GeminiFileSearchTool = ProviderTool<'gemini', 'file_search'>

export function convertFileSearchToolToAdapterFormat(tool: Tool) {
  const metadata = getGeminiProviderToolMetadata(tool) as FileSearchToolConfig
  return {
    fileSearch: metadata,
  }
}

export function fileSearchTool(
  config: FileSearchToolConfig,
): GeminiFileSearchTool {
  return brandGeminiProviderTool<GeminiFileSearchTool>(
    {
      name: 'file_search',
      description: '',
      metadata: config,
    },
    'file_search',
  )
}
