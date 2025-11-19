import type { Tool } from "@tanstack/ai";
import { AnthropicTool, CustomTool } from ".";

/**
 * Converts standard Tool format to Anthropic-specific tool format
 * 
 * @param tools - Array of standard Tool objects
 * @returns Array of Anthropic-specific tool definitions
 * 
 * @example
 * ```typescript
 * const tools: Tool[] = [{
 *   type: "function",
 *   function: {
 *     name: "get_weather",
 *     description: "Get weather for a location",
 *     parameters: {
 *       type: "object",
 *       properties: { location: { type: "string" } },
 *       required: ["location"]
 *     }
 *   }
 * }];
 * 
 * const anthropicTools = convertToolsToProviderFormat(tools);
 * ```
 */
export function convertToolsToProviderFormat<TTool extends Tool>(
  tools: TTool[],
): AnthropicTool[] {
  return tools.map(tool => ({
    type: "custom",
    name: tool.function.name,
    description: tool.function.description,
    input_schema: {
      type: "object",
      properties: tool.function.parameters.properties || null,
      required: tool.function.parameters.required || null,
    },
  }));
}
