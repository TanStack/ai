import type { ServerTool, ToolDefinition } from '@tanstack/ai'
import type { TransportInput } from './transport'

/** A bare tool definition (from `toolDefinition({...})`, no `.server()`/`.client()` called). */
export type AnyToolDefinition = ToolDefinition<any, any, string>

/** Compile-time-only descriptor of an MCP server, emitted by the codegen CLI. */
export interface ServerDescriptor {
  tools: Record<string, { input: unknown; output: unknown }>
  resources: Record<string, { uri: string; data: unknown }>
  prompts: Record<string, { args: unknown; messages: unknown }>
  capabilities: Record<string, unknown>
}

/** The "no generated types" default — discovery yields unknown-typed tools. */
export interface AutomaticDescriptor extends ServerDescriptor {
  tools: Record<string, { input: unknown; output: unknown }>
  resources: Record<string, { uri: string; data: unknown }>
  prompts: Record<string, { args: unknown; messages: unknown }>
  capabilities: Record<string, unknown>
}

export interface MCPClientOptions {
  transport: TransportInput
  /** Tool-name prefix (e.g. 'github' → 'github_search'). Default: none. */
  prefix?: string
  /** Client identity sent to the server. */
  name?: string
  version?: string
}

export interface ToolsOptions {
  /** Mark tools `lazy: true` to defer schema-sending via LazyToolManager. */
  lazy?: boolean
}

/**
 * Per-element ServerTool type from a tool definition. `def.server(execute)`
 * already returns a fully-typed `ServerTool<TInput, TOutput, TName>`, so a
 * mapped tuple over the passed definitions preserves per-tool types.
 */
export type ServerToolFromDef<TDef> = TDef extends ToolDefinition<
  infer TInput,
  infer TOutput,
  infer TName
>
  ? ServerTool<TInput, TOutput, TName>
  : never

export type MappedServerTools<TDefs extends ReadonlyArray<AnyToolDefinition>> = {
  -readonly [K in keyof TDefs]: ServerToolFromDef<TDefs[K]>
}
