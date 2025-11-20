import type { Tool } from "@tanstack/ai";
import OpenAI from "openai";

export type FunctionTool = OpenAI.Responses.FunctionTool


/**
 * Converts a standard Tool to OpenAI FunctionTool format
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  const metadata = tool.metadata as Omit<FunctionTool, "type">;
  return {
    type: "function",
    ...metadata
  };
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