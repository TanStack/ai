import { convertCustomToolToAdapterFormat } from './custom-tool'
import type { ClaudeAgentSdkTool } from '.'
import type { Tool } from '@tanstack/ai'

/**
 * Converts TanStack AI tools to Claude Agent SDK format.
 *
 * Note: The Claude Agent SDK adapter only supports custom tools.
 * Built-in SDK tools (Bash, Read, Write, etc.) are disabled by design
 * to maintain feature parity with the Anthropic adapter.
 *
 * @param tools - Array of TanStack AI Tool objects
 * @returns Array of Claude Agent SDK tool definitions
 *
 * @example
 * ```typescript
 * import { toolDefinition } from '@tanstack/ai';
 * import { z } from 'zod';
 *
 * const weatherTool = toolDefinition({
 *   name: 'get_weather',
 *   description: 'Get weather for a location',
 *   inputSchema: z.object({
 *     location: z.string().describe('City name'),
 *   }),
 * });
 *
 * const sdkTools = convertToolsToProviderFormat([weatherTool]);
 * ```
 */
export function convertToolsToProviderFormat<TTool extends Tool>(
  tools: Array<TTool>,
): Array<ClaudeAgentSdkTool> {
  return tools.map((tool) => {
    // All tools are converted as custom tools
    // Built-in tool names are not supported in this adapter
    return convertCustomToolToAdapterFormat(tool)
  })
}
