import type { Tool } from "@tanstack/ai";

export interface CodeInterpreterTool {
  type: "code_interpreter",
  /**
   * The code interpreter container. Can be a container ID or an object that specifies uploaded file IDs to make available to your code.
   */
  container: string | {
    type: "auto"
    file_ids?: string[]
    memory_limit?: string
  }
}

/**
 * Converts a standard Tool to OpenAI CodeInterpreterTool format
 */
export function convertCodeInterpreterToolToAdapterFormat(tool: Tool): CodeInterpreterTool {
  const metadata = tool.metadata as CodeInterpreterTool;
  return {
    type: "code_interpreter",
    container: metadata.container,
  };
}

/**
 * Creates a standard Tool from CodeInterpreterTool parameters
 */
export function codeInterpreterTool(
  container: CodeInterpreterTool
): Tool {
  return {
    type: "function",
    function: {
      name: "code_interpreter",
      description: "Execute code in a sandboxed environment",
      parameters: {},
    },
    metadata: {
      type: "code_interpreter",
      container,
    },
  };
}