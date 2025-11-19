import type { Tool } from "@tanstack/ai";

export interface MCPTool {
  type: "mcp"
  /**
   * A label for this MCP server, used to identify it in tool calls.
   */
  server_label: string;
  /**
   * List of allowed tool names or a filter object
   */
  allowed_tools: string[] | {
    /**
     * Indicates whether or not a tool modifies data or is read-only. If an MCP server is annotated with readOnlyHint it will match this filter.
     */
    read_only?: boolean;
    /**
     * List of allowed tool names.
     */
    tool_names?: string[];
  }
  /**
   * An OAuth access token that can be used with a remote MCP server, either with a custom MCP server URL or a service connector. Your application must handle the OAuth authorization flow and provide the token here.
   */
  authorization?: string
  /**
   * Identifier for service connectors, like those available in ChatGPT. One of server_url or connector_id must be provided.
   */
  connector_id?: "connector_dropbox" | "connector_gmail" | "connector_googlecalendar" | "connector_googledrive" | "connector_microsoftteams" | "connector_outlookcalendar" | "connector_outlookemail" | "connector_sharepoint"

  /**
   * Optional HTTP headers to send to the MCP server. Use for authentication purposes
   */
  headers?: Record<string, string>;
  /**
   * Specify which of the MCP server's tools require approval.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-tools-mcp_tool-require_approval
   * @default "always"
   */
  require_approval?: "never" | "always" | {
    always?: {
      read_only?: boolean;
      tool_names?: string[];
    }
    never?: {
      read_only?: boolean;
      tool_names?: string[];
    }
  };

  /**
   * Optional description of the MCP server, used to provide more context
   */
  server_description?: string;
  /**
   * The URL for the MCP server. One of server_url or connector_id must be provided.
   */
  server_url?: string;
}

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
  const metadata = tool.metadata as MCPTool;

  const mcpTool: MCPTool = {
    type: "mcp",
    server_label: metadata.server_label,
    allowed_tools: metadata.allowed_tools,
    authorization: metadata.authorization,
    connector_id: metadata.connector_id,
    headers: metadata.headers,
    require_approval: metadata.require_approval,
    server_description: metadata.server_description,
    server_url: metadata.server_url,
  };

  validateMCPtool(mcpTool);
  return mcpTool;
}

/**
 * Creates a standard Tool from MCPTool parameters
 */
export function mcpTool(
  toolData: MCPTool
): Tool {
  validateMCPtool(toolData);

  return {
    type: "function",
    function: {
      name: "mcp",
      description: toolData.server_description || "Model Context Protocol tool",
      parameters: {},
    },
    metadata: {
      ...toolData,
    },
  };
}