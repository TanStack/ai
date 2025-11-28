
import type { BetaMemoryTool20250818 } from '@anthropic-ai/sdk/resources/beta'
import type { Tool } from '@tanstack/ai'

export type MemoryTool = BetaMemoryTool20250818

export function convertMemoryToolToAdapterFormat(tool: Tool): MemoryTool {
  const metadata = tool.metadata as Omit<MemoryTool, "type">
  return {
    type: "memory_20250818",
    ...metadata
  }
}

export function memoryTool(config?: MemoryTool): Tool {
  return {
    name: 'memory',
    description: '',
    metadata: config,
  }
}
