import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

const validateMaxNumResults = (maxNumResults: number | undefined) => {
  if (maxNumResults && (maxNumResults < 1 || maxNumResults > 50)) {
    throw new Error('max_num_results must be between 1 and 50.')
  }
}

export type FileSearchToolConfig = OpenAI.Responses.FileSearchTool

/** @deprecated Renamed to `FileSearchToolConfig`. Will be removed in a future release. */
export type FileSearchTool = FileSearchToolConfig

export type OpenAIFileSearchTool = ProviderTool<'openai', 'file_search'>

/**
 * Converts a standard Tool to OpenAI FileSearchTool format
 */
export function convertFileSearchToolToAdapterFormat(
  tool: Tool,
): OpenAI.Responses.FileSearchTool {
  const metadata = tool.metadata as OpenAI.Responses.FileSearchTool
  return {
    type: 'file_search',
    vector_store_ids: metadata.vector_store_ids,
    max_num_results: metadata.max_num_results,
    ranking_options: metadata.ranking_options,
    filters: metadata.filters,
  }
}

/**
 * Creates a standard Tool from FileSearchTool parameters
 */
export function fileSearchTool(
  toolData: OpenAI.Responses.FileSearchTool,
): OpenAIFileSearchTool {
  validateMaxNumResults(toolData.max_num_results)
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'file_search',
    description: 'Search files in vector stores',
    metadata: {
      ...toolData,
    },
  } as unknown as OpenAIFileSearchTool
}
