import type { Tool } from "@tanstack/ai";

export interface LocalShellTool {
  type: "local_shell"
}

/**
 * Converts a standard Tool to OpenAI LocalShellTool format
 */
export function convertLocalShellToolToAdapterFormat(_tool: Tool): LocalShellTool {
  return {
    type: "local_shell",
  };
}

/**
 * Creates a standard Tool from LocalShellTool parameters
 */
export function localShellTool(): Tool {
  return {
    type: "function",
    function: {
      name: "local_shell",
      description: "Execute local shell commands",
      parameters: {},
    },
    metadata: {},
  };
}

