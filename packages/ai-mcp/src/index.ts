export { createMCPClient, createMCPClientFromTransport } from './client'
export type { MCPClient } from './client'
export type {
  AnyToolDefinition,
  MappedServerTools,
  MCPClientOptions,
  ServerDescriptor,
  ToolsOptions,
} from './types'
export type {
  TransportConfig,
  TransportInput,
  HttpTransportConfig,
  SseTransportConfig,
  StdioTransportConfig,
} from './transport'
export {
  MCPConnectionError,
  DuplicateToolNameError,
  MCPToolNotFoundError,
} from './errors'
// Converters added in Phase 4:
// export { mcpResourceToContentPart } from './resources'
// export { mcpPromptToMessages } from './prompts'

