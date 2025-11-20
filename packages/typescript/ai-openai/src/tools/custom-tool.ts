import type { Tool } from "@tanstack/ai";
import OpenAI from "openai";

export type CustomTool = OpenAI.Responses.CustomTool



/**
 * Converts a standard Tool to OpenAI CustomTool format
 */
export function convertCustomToolToAdapterFormat(tool: Tool): CustomTool {
  const metadata = tool.metadata as CustomTool;
  return {
    type: "custom",
    name: metadata.name,
    description: metadata.description,
    format: metadata.format,
  };
}

/**
 * Creates a standard Tool from CustomTool parameters
 */
export function customTool(
  toolData: CustomTool
): Tool {
  return {
    type: "function",
    function: {
      name: "custom",
      description: toolData.description || "A custom tool",
      parameters: {},
    },
    metadata: {
      ...toolData,
    },
  };
}