import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type MCPToolConfig = OpenAI.Responses.Tool.Mcp

/** @deprecated Renamed to `MCPToolConfig`. Will be removed in a future release. */
export type MCPTool = MCPToolConfig

export type OpenAIMCPTool = ProviderTool<'openai', 'mcp'>

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
    type: 'mcp',
    ...metadata,
  }

  validateMCPtool(mcpTool)
  return mcpTool
}

/**
 * Creates a standard Tool from MCPTool parameters
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
