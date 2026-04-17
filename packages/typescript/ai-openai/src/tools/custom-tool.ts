import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type CustomToolConfig = OpenAI.Responses.CustomTool

/** @deprecated Renamed to `CustomToolConfig`. Will be removed in a future release. */
export type CustomTool = CustomToolConfig

export type OpenAICustomTool = ProviderTool<'openai', 'custom'>

/**
 * Converts a standard Tool to OpenAI CustomTool format
 */
export function convertCustomToolToAdapterFormat(tool: Tool): CustomToolConfig {
  const metadata = tool.metadata as CustomToolConfig
  return {
    type: 'custom',
    name: metadata.name,
    description: metadata.description,
    format: metadata.format,
  }
}

/**
 * Creates a standard Tool from CustomTool parameters
 */
export function customTool(toolData: CustomToolConfig): OpenAICustomTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'custom',
    description: toolData.description || 'A custom tool',
    metadata: {
      ...toolData,
    },
  } as unknown as OpenAICustomTool
}
