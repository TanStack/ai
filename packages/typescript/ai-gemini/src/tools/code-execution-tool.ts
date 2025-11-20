import type { Tool } from "@tanstack/ai";

export interface CodeExecutionTool {

}

export function convertCodeExecutionToolToAdapterFormat(_tool: Tool) {
  return {
    codeExecution: {}
  };
}

export function codeExecutionTool(): Tool {
  return {
    type: "function",
    function: {
      name: "code_execution",
      description: "",
      parameters: {}
    },
    metadata: {}
  }
}