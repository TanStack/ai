import type { Tool } from "@tanstack/ai";

export interface ApplyPatchTool {
  type: "apply_patch"
}

/**
 * Converts a standard Tool to OpenAI ApplyPatchTool format
 */
export function convertApplyPatchToolToAdapterFormat(_tool: Tool): ApplyPatchTool {
  return {
    type: "apply_patch",
  };
}

/**
 * Creates a standard Tool from ApplyPatchTool parameters
 */
export function applyPatchTool(): Tool {
  return {
    type: "function",
    function: {
      name: "apply_patch",
      description: "Apply a patch to modify files",
      parameters: {},
    },
    metadata: {},
  };
}