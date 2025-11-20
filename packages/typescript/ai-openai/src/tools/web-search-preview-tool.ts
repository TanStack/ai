import type { Tool } from "@tanstack/ai";
import OpenAI from "openai";

export type WebSearchPreviewTool = OpenAI.Responses.WebSearchPreviewTool

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
    metadata: toolData
  };
}