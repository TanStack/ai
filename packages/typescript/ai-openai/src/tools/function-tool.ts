import type { Tool } from "@tanstack/ai";
import OpenAI from "openai";

export type FunctionTool = OpenAI.Responses.FunctionTool


/**
 * Converts a standard Tool to OpenAI FunctionTool format
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  // If tool has metadata (created via functionTool helper), use that
  if (tool.metadata) {
    const metadata = tool.metadata as Omit<FunctionTool, "type">;
    return {
      type: "function",
      ...metadata
    };
  }
  
  // Otherwise, convert directly from tool.function (regular Tool structure)
  // For Responses API, FunctionTool has name at top level, with function containing description and parameters
  return {
    type: "function",
    name: tool.function.name,
    function: {
      description: tool.function.description,
      parameters: tool.function.parameters,
    },
  } as FunctionTool;
}

/**
 * Creates a standard Tool from FunctionTool parameters
 */
export function functionTool(
  config: Omit<FunctionTool, "type">
): Tool {
  return {
    type: "function",
    function: {
      name: config.name,
      description: config.description ?? "",
      parameters: config.parameters ?? {},
    },
    metadata: {
      ...config
    },
  };
}