import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
import type { FileSearchTool as FileSearchToolConfig } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

export type { FileSearchToolConfig }

const validateMaxNumResults = (maxNumResults: number | undefined) => {
  if (
    maxNumResults !== undefined &&
    (maxNumResults < 1 || maxNumResults > 50)
  ) {
    throw new Error('max_num_results must be between 1 and 50.')
  }
}

/** @deprecated Renamed to `FileSearchToolConfig`. Will be removed in a future release. */
export type FileSearchTool = FileSearchToolConfig

/**
 * Converts a standard Tool to OpenAI FileSearchTool format
 */
export function convertFileSearchToolToAdapterFormat(
  tool: Tool,
): FileSearchToolConfig {
  const metadata = getOpenAIProviderToolMetadata(tool) as FileSearchToolConfig
  // Conditional spread: SDK's `FileSearchToolConfig` declares the
  // optional fields without `| undefined`, so we omit absent values
  // rather than passing them through as explicit `undefined`.
  return {
    type: 'file_search',
    vector_store_ids: metadata.vector_store_ids,
    ...(metadata.max_num_results !== undefined && {
      max_num_results: metadata.max_num_results,
    }),
    ...(metadata.ranking_options !== undefined && {
      ranking_options: metadata.ranking_options,
    }),
    ...(metadata.filters !== undefined && { filters: metadata.filters }),
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
  return openAIProviderTool(
    {
      name: 'file_search',
      description: 'Search files in vector stores',
      metadata: {
        ...toolData,
      },
    },
    'file_search',
  )
}

export { validateMaxNumResults }
