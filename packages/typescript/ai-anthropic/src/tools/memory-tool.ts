import type { BetaMemoryTool20250818 } from '@anthropic-ai/sdk/resources/beta'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type MemoryToolConfig = BetaMemoryTool20250818

/** @deprecated Renamed to `MemoryToolConfig`. Will be removed in a future release. */
export type MemoryTool = MemoryToolConfig

export type AnthropicMemoryTool = ProviderTool<'anthropic', 'memory'>

export function convertMemoryToolToAdapterFormat(tool: Tool): MemoryToolConfig {
  const metadata = tool.metadata as Omit<MemoryToolConfig, 'type'>
  return {
    type: 'memory_20250818',
    ...metadata,
  }
}

export function memoryTool(config?: MemoryToolConfig): AnthropicMemoryTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'memory',
    description: '',
    metadata: config,
  } as unknown as AnthropicMemoryTool
}
