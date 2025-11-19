import type { Tool } from "@tanstack/ai";

/**
 * Computer Use Tool by OpenAI
 * Allows you to control a virtual computer
 * https://platform.openai.com/docs/guides/tools-computer-use
 */
export interface ComputerUseTool {
  type: "computer_use_preview",
  display_height: number;
  display_width: number;
  environment: string;
}

/**
 * Converts a standard Tool to OpenAI ComputerUseTool format
 */
export function convertComputerUseToolToAdapterFormat(tool: Tool): ComputerUseTool {
  const metadata = tool.metadata as ComputerUseTool;
  return {
    type: "computer_use_preview",
    display_height: metadata.display_height,
    display_width: metadata.display_width,
    environment: metadata.environment,
  };
}

/**
 * Creates a standard Tool from ComputerUseTool parameters
 */
export function computerUseTool(
  toolData: ComputerUseTool
): Tool {
  return {
    type: "function",
    function: {
      name: "computer_use_preview",
      description: "Control a virtual computer",
      parameters: {},
    },
    metadata: {
      ...toolData,
    },
  };
}