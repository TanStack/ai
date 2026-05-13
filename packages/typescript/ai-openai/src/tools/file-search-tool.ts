import { fileSearchTool as baseFileSearchTool } from '@tanstack/openai-compatible'
import type { ProviderTool } from '@tanstack/ai'
import type { FileSearchToolConfig } from '@tanstack/openai-compatible'

export {
  type FileSearchToolConfig,
  type FileSearchTool,
  convertFileSearchToolToAdapterFormat,
} from '@tanstack/openai-compatible'

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
