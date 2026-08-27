import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
import type { Tool as SDKTool } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

type MCPToolConfig = SDKTool.Mcp

export type { MCPToolConfig }

/** @deprecated Renamed to `MCPToolConfig`. Will be removed in a future release. */
export type MCPTool = MCPToolConfig

export function validateMCPtool(tool: MCPToolConfig) {
  const hasNoServerTarget = !tool.server_url && !tool.connector_id
  if (hasNoServerTarget) {
    throw new Error('Either server_url or connector_id must be provided.')
  }
  const hasBothServerTargets = Boolean(tool.connector_id && tool.server_url)
  if (hasBothServerTargets) {
    throw new Error('Only one of server_url or connector_id can be provided.')
  }
}

export function convertMCPToolToAdapterFormat(tool: Tool): MCPToolConfig {
  const metadata = getOpenAIProviderToolMetadata(tool) as Omit<
    MCPToolConfig,
    'type'
  >

  const convertedTool: MCPToolConfig = {
    ...metadata,
    type: 'mcp',
  }

  validateMCPtool(convertedTool)
  return convertedTool
}

export function mcpTool(toolData: Omit<MCPToolConfig, 'type'>): Tool {
  validateMCPtool({ ...toolData, type: 'mcp' })

  return openAIProviderTool(
    {
      name: 'mcp',
      description: toolData.server_description || '',
      metadata: toolData,
    },
    'mcp',
  )
}
