
import type { BetaWebFetchTool20250910 } from '@anthropic-ai/sdk/resources/beta'
import type { Tool } from '@tanstack/ai'

export type WebFetchTool = BetaWebFetchTool20250910

export function convertWebFetchToolToAdapterFormat(tool: Tool): WebFetchTool {
  const metadata = tool.metadata as Omit<WebFetchTool, "type" | "name">
  return {
    name: 'web_fetch',
    type: 'web_fetch_20250910',
    ...metadata
  }
}

export function webFetchTool(config?: Omit<WebFetchTool, "type" | "name">): Tool {
  return {
    name: 'web_fetch',
    description: '',
    metadata: config
  }
}
