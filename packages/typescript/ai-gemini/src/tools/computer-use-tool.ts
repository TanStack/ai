import type { Tool } from "@tanstack/ai";

export interface ComputerUseTool {
  environment: "ENVIRONMENT_UNSPECIFIED" | "ENVIRONMENT_BROWSER";
  /**
   *  By default, predefined functions are included in the final model call. Some of them can be explicitly excluded from being automatically included. This can serve two purposes: 1. Using a more restricted / different action space. 2. Improving the definitions / instructions of predefined functions.
   */
  excludedPredefinedFunctions?: string[];
}

export function convertComputerUseToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as { environment: "ENVIRONMENT_UNSPECIFIED" | "ENVIRONMENT_BROWSER"; excludedPredefinedFunctions?: string[] };
  return {
    computerUse: {
      environment: metadata.environment,
      excludedPredefinedFunctions: metadata.excludedPredefinedFunctions
    }
  };
}

export function computerUseTool(config: { environment: "ENVIRONMENT_UNSPECIFIED" | "ENVIRONMENT_BROWSER"; excludedPredefinedFunctions?: string[] }): Tool {
  return {
    type: "function",
    function: {
      name: "computer_use",
      description: "",
      parameters: {}
    },
    metadata: {
      environment: config.environment,
      excludedPredefinedFunctions: config.excludedPredefinedFunctions
    }
  }
}