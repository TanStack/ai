import { BetaToolBash20241022, BetaToolBash20250124 } from "@anthropic-ai/sdk/resources/beta";
import type { Tool } from "@tanstack/ai";

export type BashTool = BetaToolBash20241022 | BetaToolBash20250124



export function createBashTool(config: BashTool): BashTool {
  return config
}

export function convertBashToolToAdapterFormat(tool: Tool): BashTool {
  const metadata = tool.metadata as BashTool;
  return metadata
}
export function bashTool(config: BashTool): Tool {
  return {
    type: "function",
    function: {
      name: "bash",
      description: "",
      parameters: {}
    },
    metadata: config
  }
}