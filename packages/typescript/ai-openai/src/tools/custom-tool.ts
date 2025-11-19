import type { Tool } from "@tanstack/ai";

export interface CustomTool {
  type: "custom"
  /**
   * The name of the custom tool.
   */
  name: string;
  /**
   * A description of the custom tool.
   */
  description?: string;
  /**
   * The input format for the custom tool. Default is unconstrained text.
   */
  format?: {
    type: "text"
  } | {
    type: "grammar"
    /**
     * The grammar definition.
     */
    definition: string
    /**
     * The syntax of the grammar definition. One of lark or regex.
     */
    syntax: string
  }
}

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