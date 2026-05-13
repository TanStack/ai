import { mcpTool as baseMcpTool } from '@tanstack/ai-openai-compatible'
import type { ProviderTool } from '@tanstack/ai'
import type { MCPToolConfig } from '@tanstack/ai-openai-compatible'

export {
  type MCPToolConfig,
  type MCPTool,
  validateMCPtool,
  convertMCPToolToAdapterFormat,
} from '@tanstack/ai-openai-compatible'

export type OpenAIMCPTool = ProviderTool<'openai', 'mcp'>

/**
 * Creates a standard Tool from MCPTool parameters, branded as an OpenAI provider tool.
 */
export function mcpTool(toolData: Omit<MCPToolConfig, 'type'>): OpenAIMCPTool {
  return baseMcpTool(toolData) as OpenAIMCPTool
}
