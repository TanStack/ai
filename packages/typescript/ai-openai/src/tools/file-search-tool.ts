import type { Tool } from "@tanstack/ai";
import OpenAI from "openai";

export const validateMaxNumResults = (maxNumResults: number | undefined) => {
  if (maxNumResults && (maxNumResults < 1 || maxNumResults > 50)) {
    throw new Error("max_num_results must be between 1 and 50.");
  }
};

export type FileSearchTool = OpenAI.Responses.FileSearchTool;


/**
 * Converts a standard Tool to OpenAI FileSearchTool format
 */
export function convertFileSearchToolToAdapterFormat(tool: Tool): OpenAI.Responses.FileSearchTool {
  const metadata = tool.metadata as OpenAI.Responses.FileSearchTool;
  return {
    type: "file_search",
    vector_store_ids: metadata.vector_store_ids,
    max_num_results: metadata.max_num_results,
    ranking_options: metadata.ranking_options,
    filters: metadata.filters,
  };
}

/**
 * Creates a standard Tool from FileSearchTool parameters
 */
export function fileSearchTool(
  toolData: OpenAI.Responses.FileSearchTool
): Tool {
  validateMaxNumResults(toolData.max_num_results);
  return {
    type: "function",
    function: {
      name: "file_search",
      description: "Search files in vector stores",
      parameters: {},
    },
    metadata: {
      ...toolData,
    },
  };
}