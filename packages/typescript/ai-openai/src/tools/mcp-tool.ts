import type { Tool } from "@tanstack/ai";
import OpenAI from "openai";

export type MCPTool = OpenAI.Responses.Tool.Mcp;

export const validateMCPtool = (tool: MCPTool) => {
  if (!tool.server_url && !tool.connector_id) {
    throw new Error("Either server_url or connector_id must be provided.");
  }
  if (tool.connector_id && tool.server_url) {
    throw new Error("Only one of server_url or connector_id can be provided.");
  }
}

/**
* Converts a standard Tool to OpenAI MCPTool format
*/
export function convertMCPToolToAdapterFormat(tool: Tool): MCPTool {
  const metadata = tool.metadata as Omit<MCPTool, "type">;

  const mcpTool: MCPTool = {
    type: "mcp",
    ...metadata
  }

  validateMCPtool(mcpTool);
  return mcpTool;
}

/**
 * Creates a standard Tool from MCPTool parameters
 */
export function mcpTool(
  toolData: Omit<MCPTool, "type">
): Tool {
  validateMCPtool({ ...toolData, type: "mcp" });

  return {
    type: "function",
    function: {
      name: "mcp",
      description: toolData.server_description || "",
      parameters: {},
    },
    metadata: toolData
  };
}