import { validateMCPtool } from '@tanstack/openai-base'
import type { ProviderTool } from '@tanstack/ai'
import type { MCPToolConfig } from '@tanstack/openai-base'

export {
  type MCPToolConfig,
  type MCPTool,
  validateMCPtool,
  convertMCPToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAIMCPTool = ProviderTool<'openai', 'mcp'>

/**
 * Creates a standard Tool from MCPTool parameters, branded as an OpenAI provider tool.
 */
export function mcpTool(toolData: Omit<MCPToolConfig, 'type'>): OpenAIMCPTool {
  validateMCPtool({ ...toolData, type: 'mcp' })

  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'mcp',
    description: toolData.server_description || '',
    metadata: toolData,
  } as unknown as OpenAIMCPTool
}
