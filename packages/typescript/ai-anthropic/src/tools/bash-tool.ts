import type { ToolBash20250124 } from '@anthropic-ai/sdk/resources/messages'
import type { Tool } from '@tanstack/ai'

export type BashTool = ToolBash20250124

export function convertBashToolToAdapterFormat(tool: Tool): BashTool {
  const metadata = tool.metadata as BashTool
  return metadata
}
export function bashTool(config: BashTool): Tool {
  return {
    name: 'bash',
    description: '',
    metadata: config,
  }
}
