import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type MCPToolConfig = OpenAI.Responses.Tool.Mcp

/** @deprecated Renamed to `MCPToolConfig`. Will be removed in a future release. */
export type MCPTool = MCPToolConfig

export type GrokMCPTool = ProviderTool<'grok', 'mcp'>

export function validateMCPTool(tool: MCPToolConfig) {
  if (!tool.server_url && !tool.connector_id) {
    throw new Error('Either server_url or connector_id must be provided.')
  }
  if (tool.connector_id && tool.server_url) {
    throw new Error('Only one of server_url or connector_id can be provided.')
  }
}

export function convertMCPToolToAdapterFormat(tool: Tool): MCPToolConfig {
  const metadata = tool.metadata as Omit<MCPToolConfig, 'type'>
  const mcpTool: MCPToolConfig = {
    type: 'mcp',
    ...metadata,
  }
  validateMCPTool(mcpTool)
  return mcpTool
}

export function mcpTool(toolData: Omit<MCPToolConfig, 'type'>): GrokMCPTool {
  validateMCPTool({ ...toolData, type: 'mcp' })
  return {
    name: 'mcp',
    description: toolData.server_description || '',
    metadata: {
      type: 'mcp',
      ...toolData,
    },
  } as unknown as GrokMCPTool
}
