import { fileSearchTool as baseFileSearchTool } from '@tanstack/openai-base'
import type { ProviderTool } from '@tanstack/ai'
import type { FileSearchToolConfig } from '@tanstack/openai-base'

export {
  type FileSearchToolConfig,
  type FileSearchTool,
  convertFileSearchToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAIFileSearchTool = ProviderTool<'openai', 'file_search'>

/**
 * Creates a standard Tool from FileSearchTool parameters, branded as an
 * OpenAI provider tool.
 */
export function fileSearchTool(
  toolData: FileSearchToolConfig,
): OpenAIFileSearchTool {
  return baseFileSearchTool(toolData) as OpenAIFileSearchTool
}
