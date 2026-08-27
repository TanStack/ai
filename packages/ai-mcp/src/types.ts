import type { ServerTool, ToolDefinition } from '@tanstack/ai'
import type { ClientOptions } from '@modelcontextprotocol/sdk/client/index.js'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import type { TransportInput } from './transport'

/** A bare tool definition (from `toolDefinition({...})`, no `.server()`/`.client()` called). */
export type AnyToolDefinition = ToolDefinition<any, any, string>

export interface McpToolMetadata {
  /** Server-native (UNPREFIXED) tool name, even when the client sets a `prefix`. */
  serverToolName: string
  title: string
  /** The owning client's `prefix` (the value a widget sends as `serverId`). */
  serverId?: string
  /** MCP Apps widget link, from the tool def's `_meta.ui.resourceUri`. */
  uiResourceUri?: string
  annotations?: ToolAnnotations
}

export type McpServerTool<
  TTool extends ServerTool<any, any, any> = ServerTool,
> = Omit<TTool, 'metadata'> & {
  metadata: Record<string, any> & { mcp: McpToolMetadata }
}

/** Compile-time-only descriptor of an MCP server, emitted by the codegen CLI. */
export interface ServerDescriptor {
  tools: Record<string, { input: unknown; output: unknown }>
  resources: Record<string, { uri: string; data: unknown }>
  prompts: Record<string, { args: unknown; messages: unknown }>
  capabilities: Record<string, unknown>
}

/** The "no generated types" default — discovery yields untyped tools. */
export type AutomaticDescriptor = ServerDescriptor

export interface MCPClientOptions {
  transport: TransportInput
  /** Tool-name prefix (e.g. 'github' → 'github_search'). Default: none. */
  prefix?: string
  /** Client identity sent to the server. */
  name?: string
  version?: string
  clientOptions?: ClientOptions
}

export interface ToolsOptions {
  /** Mark tools `lazy: true` to defer schema-sending via LazyToolManager. */
  lazy?: boolean
}

export type ServerToolFromDef<TDef> =
  TDef extends ToolDefinition<infer TInput, infer TOutput, infer TName>
    ? McpServerTool<ServerTool<TInput, TOutput, TName>>
    : never

export type MappedServerTools<TDefs extends ReadonlyArray<AnyToolDefinition>> =
  {
    -readonly [K in keyof TDefs]: ServerToolFromDef<TDefs[K]>
  }

type DescribedTool<TKey extends string> = McpServerTool<
  ServerTool<any, any, TKey>
>

export type DescriptorTools<TServer extends ServerDescriptor> = Array<
  {
    [K in keyof TServer['tools'] & string]: DescribedTool<K>
  }[keyof TServer['tools'] & string]
>
