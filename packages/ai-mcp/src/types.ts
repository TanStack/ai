import type { ServerTool, ToolDefinition } from '@tanstack/ai'
import type { ClientOptions } from '@modelcontextprotocol/sdk/client/index.js'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import type { TransportInput } from './transport'

/** A bare tool definition (from `toolDefinition({...})`, no `.server()`/`.client()` called). */
export type AnyToolDefinition = ToolDefinition<any, any, string>

/**
 * The `mcp` block stamped onto every tool this package produces
 * (`tool.metadata.mcp`), on BOTH the auto-discovery and explicit
 * `tools(defs)` paths.
 *
 * You rarely name this type: `tools()` returns {@link McpServerTool}s, whose
 * `metadata.mcp` is already typed as this shape, so the read needs no
 * annotation and no cast:
 *
 * ```ts
 * const tools = await mcp.tools()
 * for (const tool of tools) {
 *   if (tool.metadata.mcp.annotations?.readOnlyHint) {
 *     // e.g. skip the approval prompt for a read-only tool
 *   }
 * }
 * ```
 */
export interface McpToolMetadata {
  /** Server-native (UNPREFIXED) tool name, even when the client sets a `prefix`. */
  serverToolName: string
  /**
   * Human-readable display name, resolved with the MCP spec's precedence:
   * `title` → `annotations.title` → `name`. Always set, so a UI can render it
   * without re-implementing the fallback chain.
   */
  title: string
  /** The owning client's `prefix` (the value a widget sends as `serverId`). */
  serverId?: string
  /** MCP Apps widget link, from the tool def's `_meta.ui.resourceUri`. */
  uiResourceUri?: string
  /**
   * The server's `annotations` for this tool, forwarded verbatim (absent when
   * the server declares none). All fields are **hints** — useful for display
   * and for shaping an approval UI, never a security boundary.
   */
  annotations?: ToolAnnotations
}

/**
 * A `ServerTool` produced by this package — structurally a plain `ServerTool`
 * (so it drops straight into `chat({ tools })`) with one difference: its
 * `metadata.mcp` block is statically known to be present and typed as
 * {@link McpToolMetadata}.
 *
 * `ServerTool['metadata']` is `Record<string, any> | undefined`, so reading
 * `tool.metadata.mcp` off a bare `ServerTool` neither compiles (possibly
 * undefined) nor type-checks the fields under it (`any`). Every `tools()`
 * overload returns these instead, which makes the natural read work and a
 * misspelling a compile error:
 *
 * ```ts
 * const [tool] = await mcp.tools()
 * tool.metadata.mcp.title             // string
 * tool.metadata.mcp.annotaions        // compile error (typo)
 * ```
 */
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
  /**
   * Options forwarded verbatim to the MCP SDK's `Client`.
   *
   * The one that matters in practice is `jsonSchemaValidator`. The SDK
   * validates a tool's `structuredContent` against its declared `outputSchema`,
   * and its default validator is AJV — which compiles each schema by building
   * JavaScript source and passing it to `new Function`. Edge runtimes forbid
   * that: on Cloudflare Workers every call to a tool with an `outputSchema`
   * fails with `Code generation from strings disallowed for this context`,
   * wrapped by AJV as `Error compiling schema`.
   *
   * The SDK ships the fix (`CfWorkerJsonSchemaValidator`, backed by the
   * optional peer `@cfworker/json-schema`) but it can only be installed through
   * `ClientOptions`, which this package did not expose.
   *
   * ```ts
   * import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
   *
   * const mcp = await createMCPClient({
   *   transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
   *   clientOptions: { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
   * })
   * ```
   */
  clientOptions?: ClientOptions
}

export interface ToolsOptions {
  /** Mark tools `lazy: true` to defer schema-sending via LazyToolManager. */
  lazy?: boolean
}

/**
 * Per-element ServerTool type from a tool definition. `def.server(execute)`
 * already returns a fully-typed `ServerTool<TInput, TOutput, TName>`, so a
 * mapped tuple over the passed definitions preserves per-tool types. Wrapped
 * in {@link McpServerTool} because the explicit path stamps `metadata.mcp` too.
 */
export type ServerToolFromDef<TDef> =
  TDef extends ToolDefinition<infer TInput, infer TOutput, infer TName>
    ? McpServerTool<ServerTool<TInput, TOutput, TName>>
    : never

export type MappedServerTools<TDefs extends ReadonlyArray<AnyToolDefinition>> =
  {
    -readonly [K in keyof TDefs]: ServerToolFromDef<TDefs[K]>
  }

/**
 * ServerTool named by one descriptor tool key `TKey`.
 *
 * Only the tool **name** survives into the discovery result — input/output
 * stay `any` because `ServerTool`'s generics are *schema* types
 * (`extends SchemaInput`), while the descriptor carries plain *value* types
 * emitted by the codegen CLI. Per-tool argument/result typing comes from the
 * explicit `tools(defs)` overload via `MappedServerTools`.
 */
type DescribedTool<TKey extends string> = McpServerTool<
  ServerTool<any, any, TKey>
>

/**
 * Discovery result typed from the generated descriptor: an array whose
 * elements' `name` is the union of the descriptor's tool-name literals.
 * Arguments/results are untyped (`any`) on this path — use the `tools(defs)`
 * overload for typed args. When TServer is the AutomaticDescriptor (no
 * generated types), this collapses to `Array<ServerTool>`.
 */
export type DescriptorTools<TServer extends ServerDescriptor> = Array<
  {
    [K in keyof TServer['tools'] & string]: DescribedTool<K>
  }[keyof TServer['tools'] & string]
>
