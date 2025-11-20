import { BetaCodeExecutionTool20250522, BetaCodeExecutionTool20250825 } from "@anthropic-ai/sdk/resources/beta";
import type { Tool } from "@tanstack/ai";

export type CodeExecutionTool = BetaCodeExecutionTool20250522 | BetaCodeExecutionTool20250825

export function createCodeExecutionTool(config: CodeExecutionTool): CodeExecutionTool {
  return config
}

export function convertCodeExecutionToolToAdapterFormat(tool: Tool): CodeExecutionTool {
  const metadata = tool.metadata as CodeExecutionTool
  return metadata
}

export function codeExecutionTool(config: CodeExecutionTool): Tool {
  return {
    type: "function",
    function: {
      name: "code_execution",
      description: "",
      parameters: {}
    },
    metadata: config
  }
}

