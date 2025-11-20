import { BetaMemoryTool20250818 } from "@anthropic-ai/sdk/resources/beta";
import type { Tool } from "@tanstack/ai";

export type MemoryTool = BetaMemoryTool20250818


export function convertMemoryToolToAdapterFormat(tool: Tool): MemoryTool {
  const metadata = tool.metadata as MemoryTool
  return metadata
}

export function memoryTool(cacheControl?: MemoryTool): Tool {
  return {
    type: "function",
    function: {
      name: "memory",
      description: "",
      parameters: {}
    },
    metadata: {
      cacheControl
    }
  }
}