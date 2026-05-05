import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

const validateVectorStoreIds = (ids: Array<string> | undefined) => {
  if (!ids || ids.length === 0) {
    throw new Error('vector_store_ids must contain at least one id.')
  }
}

export type FileSearchToolConfig = OpenAI.Responses.FileSearchTool
export type FileSearchToolOptions = FileSearchToolConfig

export interface CollectionsSearchToolConfig {
  type: 'collections_search'
  vector_store_ids: Array<string>
  max_num_results?: number
}

export type CollectionsSearchToolOptions = Omit<
  CollectionsSearchToolConfig,
  'type'
>

/** @deprecated Renamed to `FileSearchToolConfig`. Will be removed in a future release. */
export type FileSearchTool = FileSearchToolConfig
/** @deprecated Renamed to `CollectionsSearchToolConfig`. Will be removed in a future release. */
export type CollectionsSearchTool = CollectionsSearchToolConfig

export type GrokFileSearchTool = ProviderTool<'grok', 'file_search'>
export type GrokCollectionsSearchTool = ProviderTool<'grok', 'collections_search'>

export function convertFileSearchToolToAdapterFormat(
  tool: Tool,
): FileSearchToolConfig {
  const metadata = tool.metadata as FileSearchToolConfig
  validateVectorStoreIds(metadata.vector_store_ids)
  return {
    type: 'file_search',
    vector_store_ids: metadata.vector_store_ids,
    max_num_results: metadata.max_num_results,
    ranking_options: metadata.ranking_options,
    filters: metadata.filters,
  }
}

export function convertCollectionsSearchToolToAdapterFormat(
  tool: Tool,
): CollectionsSearchToolConfig {
  const metadata = tool.metadata as CollectionsSearchToolConfig
  validateVectorStoreIds(metadata.vector_store_ids)
  return {
    type: 'collections_search',
    vector_store_ids: metadata.vector_store_ids,
    max_num_results: metadata.max_num_results,
  }
}

export function fileSearchTool(
  toolData: FileSearchToolConfig,
): GrokFileSearchTool {
  validateVectorStoreIds(toolData.vector_store_ids)
  return {
    name: 'file_search',
    description: 'Search files in vector stores',
    metadata: {
      ...toolData,
    },
  } as unknown as GrokFileSearchTool
}

export function collectionsSearchTool(
  toolData: CollectionsSearchToolOptions,
): GrokCollectionsSearchTool {
  validateVectorStoreIds(toolData.vector_store_ids)
  return {
    name: 'collections_search',
    description: 'Search uploaded document collections',
    metadata: {
      type: 'collections_search',
      ...toolData,
    },
  } as unknown as GrokCollectionsSearchTool
}
