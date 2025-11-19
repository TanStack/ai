import type { Tool } from "@tanstack/ai";
import { UserLocation } from "./web-search-tool";

export interface WebSearchPreviewTool {
  type: "web_search_preview" | "web_search_preview_2025_03_11";
  /**
   * High level guidance for the amount of context window space to use for the search. 
   * @default "medium"
   */
  search_context_size?: "low" | "medium" | "high";
  user_location?: UserLocation
}

/**
 * Converts a standard Tool to OpenAI WebSearchPreviewTool format
 */
export function convertWebSearchPreviewToolToAdapterFormat(tool: Tool): WebSearchPreviewTool {
  const metadata = tool.metadata as WebSearchPreviewTool;
  return {
    type: metadata.type,
    search_context_size: metadata.search_context_size,
    user_location: metadata.user_location,
  };
}

/**
 * Creates a standard Tool from WebSearchPreviewTool parameters
 */
export function webSearchPreviewTool(
  toolData: WebSearchPreviewTool
): Tool {
  return {
    type: "function",
    function: {
      name: "web_search_preview",
      description: "Search the web (preview version)",
      parameters: {},
    },
    metadata: {
      ...toolData,
    },
  };
}