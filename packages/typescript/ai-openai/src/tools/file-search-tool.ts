import type { ProviderTool } from '@tanstack/ai'
import type { FileSearchToolConfig } from '@tanstack/openai-base'

export {
  type FileSearchToolConfig,
  type FileSearchTool,
  convertFileSearchToolToAdapterFormat,
} from '@tanstack/openai-base'

const validateMaxNumResults = (maxNumResults: number | undefined) => {
  if (maxNumResults && (maxNumResults < 1 || maxNumResults > 50)) {
    throw new Error('max_num_results must be between 1 and 50.')
  }
}

export type OpenAIFileSearchTool = ProviderTool<'openai', 'file_search'>

/**
 * Creates a standard Tool from FileSearchTool parameters, branded as an
 * OpenAI provider tool.
 */
export function fileSearchTool(
  toolData: FileSearchToolConfig,
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
