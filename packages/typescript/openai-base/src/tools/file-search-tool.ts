import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

const validateMaxNumResults = (maxNumResults: number | undefined) => {
  if (maxNumResults && (maxNumResults < 1 || maxNumResults > 50)) {
    throw new Error('max_num_results must be between 1 and 50.')
  }
}

export type FileSearchToolConfig = OpenAI.Responses.FileSearchTool

/** @deprecated Renamed to `FileSearchToolConfig`. Will be removed in a future release. */
export type FileSearchTool = FileSearchToolConfig

/**
 * Converts a standard Tool to OpenAI FileSearchTool format
 */
export function convertFileSearchToolToAdapterFormat(
  tool: Tool,
): FileSearchToolConfig {
  const metadata = tool.metadata as FileSearchToolConfig
  return {
    type: 'file_search',
    vector_store_ids: metadata.vector_store_ids,
    max_num_results: metadata.max_num_results,
    ranking_options: metadata.ranking_options,
    filters: metadata.filters,
  }
}

/**
 * Creates a standard Tool from FileSearchTool parameters.
 *
 * Validates max_num_results. Base (non-branded) factory; providers that need
 * branded return types should re-wrap in their own package.
 */
export function fileSearchTool(toolData: FileSearchToolConfig): Tool {
  validateMaxNumResults(toolData.max_num_results)
  return {
    name: 'file_search',
    description: 'Search files in vector stores',
    metadata: {
      ...toolData,
    },
  }
}

export { validateMaxNumResults }
