import { mcpTool as baseMcpTool } from '@tanstack/openai-base'
import type { ProviderTool } from '@tanstack/ai'
import type { MCPToolConfig } from '@tanstack/openai-base'

export {
  type MCPToolConfig,
  type MCPTool,
  validateMCPtool,
  convertMCPToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAIMCPTool = ProviderTool<'openai', 'mcp'>

export function mcpTool(toolData: Omit<MCPToolConfig, 'type'>): OpenAIMCPTool {
  return baseMcpTool(toolData) as OpenAIMCPTool
}
