import type { AnyServerTool } from '../tools/tool-definition'

export interface McpResourceReadResult {
  contents: Array<{
    uri: string
    mimeType?: string
    text?: string
    blob?: string
  }>
}

export interface MCPToolSource {
  tools: (options?: { lazy?: boolean }) => Promise<Array<AnyServerTool>>
  close: () => Promise<void>
  readResource?: (uri: string) => Promise<McpResourceReadResult>
}

export type MCPConnectionPolicy = 'close' | 'keep-alive'

export interface ChatMCPOptions {
  clients: Array<MCPToolSource>

  connection?: MCPConnectionPolicy

  lazyTools?: boolean

  onDiscoveryError?: (
    error: unknown,
    source: MCPToolSource,
  ) => void | Promise<void>
}
