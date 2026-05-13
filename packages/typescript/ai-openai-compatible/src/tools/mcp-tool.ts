import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type MCPToolConfig = OpenAI.Responses.Tool.Mcp

/** @deprecated Renamed to `MCPToolConfig`. Will be removed in a future release. */
export type MCPTool = MCPToolConfig

export function validateMCPtool(tool: MCPToolConfig) {
  if (!tool.server_url && !tool.connector_id) {
    throw new Error('Either server_url or connector_id must be provided.')
  }
  if (tool.connector_id && tool.server_url) {
    throw new Error('Only one of server_url or connector_id can be provided.')
  }
}

/**
 * Converts a standard Tool to OpenAI MCPTool format
 */
export function convertMCPToolToAdapterFormat(tool: Tool): MCPToolConfig {
  const metadata = tool.metadata as Omit<MCPToolConfig, 'type'>

  const mcpTool: MCPToolConfig = {
    ...metadata,
    type: 'mcp',
  }

  validateMCPtool(mcpTool)
  return mcpTool
}

/**
 * Creates a standard Tool from MCPTool parameters.
 *
 * Base (non-branded) factory. Providers that need branded return types should
 * re-wrap this in their own package.
 */
export function mcpTool(toolData: Omit<MCPToolConfig, 'type'>): Tool {
  validateMCPtool({ ...toolData, type: 'mcp' })

  return {
    name: 'mcp',
    description: toolData.server_description || '',
    metadata: toolData,
  }
}
