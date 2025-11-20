import type { Tool } from "@tanstack/ai";
import OpenAI from "openai";

export type ShellTool = OpenAI.Responses.FunctionShellTool

/**
 * Converts a standard Tool to OpenAI ShellTool format
 */
export function convertShellToolToAdapterFormat(_tool: Tool): ShellTool {
  return {
    type: "shell",
  };
}

/**
 * Creates a standard Tool from ShellTool parameters
 */
export function shellTool(): Tool {
  return {
    type: "function",
    function: {
      name: "shell",
      description: "Execute shell commands",
      parameters: {},
    },
    metadata: {},
  };
}