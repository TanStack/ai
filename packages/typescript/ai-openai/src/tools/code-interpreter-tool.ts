import type { Tool } from "@tanstack/ai";
import type OpenAI from "openai"

export type CodeInterpreterTool = OpenAI.Responses.Tool.CodeInterpreter;


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