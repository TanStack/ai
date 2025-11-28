import type { Tool } from '@tanstack/ai'
import type { FileSearch } from '@google/genai'

export type FileSearchTool = FileSearch

export function convertFileSearchToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as FileSearchTool
  return {
    fileSearch: metadata,
  }
}

export function fileSearchTool(config: FileSearchTool): Tool {
  return {
    name: 'file_search',
    description: '',
    metadata: config,
  }
}
