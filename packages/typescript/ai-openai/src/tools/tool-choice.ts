interface MCPToolChoice {
  type: 'mcp'
  server_label: 'deepwiki'
}

interface FunctionToolChoice {
  type: 'function'
  name: string
}

interface CustomToolChoice {
  type: 'custom'
  name: string
}

interface HostedToolChoice {
  type:
    | 'file_search'
    | 'web_search_preview'
    | 'computer_use_preview'
    | 'code_interpreter'
    | 'image_generation'
    | 'shell'
    | 'apply_patch'
}

export type ToolChoice =
  | MCPToolChoice
  | FunctionToolChoice
  | CustomToolChoice
  | HostedToolChoice
