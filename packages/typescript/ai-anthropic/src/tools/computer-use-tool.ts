import { BetaToolComputerUse20241022, BetaToolComputerUse20250124 } from "@anthropic-ai/sdk/resources/beta";
import type { Tool } from "@tanstack/ai";


export type ComputerUseTool = BetaToolComputerUse20241022 | BetaToolComputerUse20250124

export function createComputerUseTool(
  config: ComputerUseTool
): ComputerUseTool {
  return config
}

export function convertComputerUseToolToAdapterFormat(tool: Tool): ComputerUseTool {
  const metadata = tool.metadata as ComputerUseTool
  return metadata
}

export function computerUseTool(config: ComputerUseTool): Tool {
  return {
    type: "function",
    function: {
      name: "computer",
      description: "",
      parameters: {}
    },
    metadata: config
  }
}