export interface MCPToolChoice {
  type: "mcp"
  server_label: "deepwiki"
}

export interface FunctionToolChoice {
  type: "function"
  name: string;
}

export interface CustomToolChoice {
  type: "custom"
  name: string;
}

export interface HostedToolChoice {
  type: "file_search" | "web_search_preview" | "computer_use_preview" | "code_interpreter" | "image_generation" | "shell" | "apply_patch"
}

export type ToolChoice = MCPToolChoice | FunctionToolChoice | CustomToolChoice | HostedToolChoice;