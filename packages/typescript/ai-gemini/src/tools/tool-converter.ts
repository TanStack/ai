import type { Tool } from "@tanstack/ai";
import { convertCodeExecutionToolToAdapterFormat } from "./code-execution-tool";
import { convertComputerUseToolToAdapterFormat } from "./computer-use-tool";
import { convertFileSearchToolToAdapterFormat } from "./file-search-tool";
import { convertGoogleMapsToolToAdapterFormat } from "./google-maps-tool";
import { convertGoogleSearchRetrievalToolToAdapterFormat } from "./google-search-retriveal-tool";
import { convertGoogleSearchToolToAdapterFormat } from "./google-search-tool";
import { convertUrlContextToolToAdapterFormat } from "./url-context-tool";
import { GoogleGeminiTool } from ".";

/**
 * Converts standard Tool format to Gemini-specific tool format
 * 
 * @param tools - Array of standard Tool objects
 * @returns Array of Gemini-specific tool definitions
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
 * const geminiTools = convertToolsToProviderFormat(tools);
 * ```
 */
export function convertToolsToProviderFormat<TTool extends Tool>(
  tools: TTool[],
): GoogleGeminiTool[] {
  return tools.map(tool => {
    const name = tool.function.name;

    switch (name) {
      case "code_execution":
        return convertCodeExecutionToolToAdapterFormat(tool);
      case "computer_use":
        return convertComputerUseToolToAdapterFormat(tool);
      case "file_search":
        return convertFileSearchToolToAdapterFormat(tool);
      case "google_maps":
        return convertGoogleMapsToolToAdapterFormat(tool);
      case "google_search_retrieval":
        return convertGoogleSearchRetrievalToolToAdapterFormat(tool);
      case "google_search":
        return convertGoogleSearchToolToAdapterFormat(tool);
      case "url_context":
        return convertUrlContextToolToAdapterFormat(tool);
      default:
        // For custom function declarations, return functionDeclarations format
        return {
          functionDeclarations: [{
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
          }]
        };
    }
  });
}
