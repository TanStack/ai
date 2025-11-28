import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type MCPTool = OpenAI.Responses.Tool.Mcp

export function validateMCPtool(tool: MCPTool) {
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
export function convertMCPToolToAdapterFormat(tool: Tool): MCPTool {
  const metadata = tool.metadata as Omit<MCPTool, 'type'>

  const mcpTool: MCPTool = {
    type: 'mcp',
    ...metadata,
  }

  validateMCPtool(mcpTool)
  return mcpTool
}

/**
 * Creates a standard Tool from MCPTool parameters
 */
export function mcpTool(toolData: Omit<MCPTool, 'type'>): Tool {
  validateMCPtool({ ...toolData, type: 'mcp' })

  return {
    name: 'mcp',
    description: toolData.server_description || '',
    metadata: toolData,
  }
}
