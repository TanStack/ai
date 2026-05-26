import type { CustomTool as CustomToolConfig } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

export type { CustomToolConfig }

/** @deprecated Renamed to `CustomToolConfig`. Will be removed in a future release. */
export type CustomTool = CustomToolConfig

/**
 * Converts a standard Tool to OpenAI CustomTool format
 */
export function convertCustomToolToAdapterFormat(tool: Tool): CustomToolConfig {
  const metadata = tool.metadata as CustomToolConfig
  // Conditional spread: the SDK's `CustomToolConfig` declares optional
  // fields as `description?: string` (no `| undefined`) under
  // exactOptionalPropertyTypes, so we omit absent fields rather than
  // passing them through as explicit `undefined`.
  return {
    type: 'custom',
    name: metadata.name,
    ...(metadata.description !== undefined && {
      description: metadata.description,
    }),
    ...(metadata.format !== undefined && { format: metadata.format }),
  }
}

/**
 * Creates a standard Tool from CustomTool parameters.
 */
export function customTool(toolData: CustomToolConfig): Tool {
  return {
    name: 'custom',
    description: toolData.description || 'A custom tool',
    metadata: {
      ...toolData,
    },
  }
}
