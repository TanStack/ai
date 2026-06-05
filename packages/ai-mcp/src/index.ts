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
export type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
export { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
export {
  MCPConnectionError,
  DuplicateToolNameError,
  MCPTaskRequiredToolError,
  MCPToolNotFoundError,
} from './errors'
// Converters added in Phase 4:
export { mcpResourceToContentPart } from './resources'
export { mcpPromptToMessages } from './prompts'
export { createMCPClients } from './pool'
export type { MCPClients, MCPClientsConfig } from './pool'
export { defineConfig } from './cli/define-config'
export type { MCPCodegenConfig, CodegenServerConfig } from './cli/define-config'
