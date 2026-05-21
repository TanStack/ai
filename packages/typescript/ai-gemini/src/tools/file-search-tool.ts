import { brandProviderTool } from '@tanstack/ai'
import type { FileSearch } from '@google/genai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type FileSearchToolConfig = FileSearch

/** @deprecated Renamed to `FileSearchToolConfig`. Will be removed in a future release. */
export type FileSearchTool = FileSearchToolConfig

export type GeminiFileSearchTool = ProviderTool<'gemini', 'file_search'>

export function convertFileSearchToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as FileSearchToolConfig
  return {
    fileSearch: metadata,
  }
}

export function fileSearchTool(
  config: FileSearchToolConfig,
): GeminiFileSearchTool {
  return brandProviderTool<GeminiFileSearchTool>({
    name: 'file_search',
    description: '',
    metadata: config,
  })
}
