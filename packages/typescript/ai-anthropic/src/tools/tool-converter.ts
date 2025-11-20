import type { Tool } from "@tanstack/ai";
import { AnthropicTool, } from ".";
import { convertBashToolToAdapterFormat } from "./bash-tool";
import { convertCodeExecutionToolToAdapterFormat } from "./code-execution-tool";
import { convertComputerUseToolToAdapterFormat } from "./computer-use-tool";
import { convertCustomToolToAdapterFormat } from "./custom-tool";
import { convertMemoryToolToAdapterFormat } from "./memory-tool";
import { convertTextEditorToolToAdapterFormat } from "./text-editor-tool";
import { convertWebFetchToolToAdapterFormat } from "./web-fetch-tool";
import { convertWebSearchToolToAdapterFormat } from "./web-search-tool";

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
  return tools.map(tool => {
    const name = tool.function.name;

    switch (name) {
      case "bash":
        return convertBashToolToAdapterFormat(tool);
      case "code_execution":
        return convertCodeExecutionToolToAdapterFormat(tool);
      case "computer":
        return convertComputerUseToolToAdapterFormat(tool);
      case "memory":
        return convertMemoryToolToAdapterFormat(tool);
      case "str_replace_editor":
        return convertTextEditorToolToAdapterFormat(tool);
      case "web_fetch":
        return convertWebFetchToolToAdapterFormat(tool);
      case "web_search":
        return convertWebSearchToolToAdapterFormat(tool);
      default:
        return convertCustomToolToAdapterFormat(tool);
    }
  });
}
