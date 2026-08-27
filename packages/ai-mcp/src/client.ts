import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { ClientOptions } from '@modelcontextprotocol/sdk/client/index.js'
import {
  DuplicateToolNameError,
  MCPConnectionError,
  MCPTaskRequiredToolError,
  MCPToolNotFoundError,
} from './errors'
import {
  makeMcpExecute,
  requiresTaskExecution,
  toolMcpMetadata,
  toServerTools,
} from './tools'
import { isTransportInstance, resolveTransport } from './transport'
import type { TransportConfig } from './transport'
import type {
  AnyToolDefinition,
  AutomaticDescriptor,
  DescriptorTools,
  MCPClientOptions,
  MappedServerTools,
  McpServerTool,
  ServerDescriptor,
  ToolsOptions,
} from './types'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type {
  GetPromptResult,
  Prompt,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/types.js'
import type { ServerTool } from '@tanstack/ai'

export interface MCPClient<
  TServer extends ServerDescriptor = AutomaticDescriptor,
> {
  readonly capabilities: TServer['capabilities']
  /**
   * Auto-discovery: every server tool as a ServerTool. With a generated
   * descriptor, tool names are typed as the descriptor's name literals;
   * args/results stay untyped — use the `tools(defs)` overload for typed args.
   *
   * Both overloads yield {@link McpServerTool}s, so `tool.metadata.mcp` (the
   * server's title / annotations) is typed without an annotation or a cast.
   */
  tools: {
    (options?: ToolsOptions): Promise<DescriptorTools<TServer>>
    <const TDefs extends ReadonlyArray<AnyToolDefinition>>(
      defs: TDefs,
      options?: ToolsOptions,
    ): Promise<MappedServerTools<TDefs>>
  }
  resources: () => Promise<Array<Resource>>
  readResource: (uri: string) => Promise<ReadResourceResult>
  resourceTemplates: () => Promise<Array<ResourceTemplate>>
  prompts: () => Promise<Array<Prompt>>
  getPrompt: (
    name: string,
    args?: Record<string, string>,
  ) => Promise<GetPromptResult>
  callTool: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<Awaited<ReturnType<Client['callTool']>>>
  /**
   * The ORIGINAL connection descriptor this client was created from — the
   * `transport` input and `prefix` passed to `createMCPClient`. Used by
   * `createMcpAppCallHandler` to reconnect per-call (serverless-safe) without
   * a separate transport-config map.
   *
   * `transport` is `undefined` when the client was built from a ready-made
   * `Transport` instance rather than a serializable config — either via
   * `createMCPClientFromTransport` (test-only) or `createMCPClient({ transport:
   * <instance> })`. A live `Transport` instance is single-use and cannot be
   * reconnected, so only serializable `TransportConfig`s are retained here.
   */
  getInfo: () => {
    transport: TransportConfig | undefined
    prefix: string | undefined
    /**
     * The options this client was built with, so a caller that reconstructs it
     * from this descriptor keeps them. Without it a rebuilt client silently
     * reverts to the SDK defaults — including the AJV validator that edge
     * runtimes cannot compile.
     *
     * Optional so an existing hand-rolled `MCPClient` keeps compiling.
     */
    clientOptions?: ClientOptions
  }
  close: () => Promise<void>
  [Symbol.asyncDispose]: () => Promise<void>
}

class MCPClientImpl<
  TServer extends ServerDescriptor,
> implements MCPClient<TServer> {
  capabilities: TServer['capabilities'] = {}
  readonly #client: Client
  #closed = false
  private readonly prefix?: string
  // The ORIGINAL serializable transport config (undefined for clients built
  // from a ready-made Transport instance, which is single-use / not reconnectable).
  readonly #transport: TransportConfig | undefined
  readonly #clientOptions: ClientOptions | undefined

  constructor(
    prefix?: string,
    name = 'tanstack-ai-mcp',
    version = '0.0.1',
    transport?: TransportConfig,
    clientOptions?: ClientOptions,
  ) {
    this.prefix = prefix
    this.#transport = transport
    this.#clientOptions = clientOptions
    this.#client = new Client({ name, version }, clientOptions)
  }

  getInfo(): {
    transport: TransportConfig | undefined
    prefix: string | undefined
    clientOptions?: ClientOptions
  } {
    return {
      transport: this.#transport,
      prefix: this.prefix,
      ...(this.#clientOptions ? { clientOptions: this.#clientOptions } : {}),
    }
  }

  async connect(transport: Transport): Promise<void> {
    try {
      await this.#client.connect(transport)
      this.capabilities = this.#client.getServerCapabilities() ?? {}
    } catch (err) {
      throw new MCPConnectionError('Failed to connect to MCP server', err)
    }
  }

  async tools(
    defsOrOptions?: ReadonlyArray<AnyToolDefinition> | ToolsOptions,
    maybeOptions: ToolsOptions = {},
  ): Promise<Array<McpServerTool>> {
    if (this.#closed) throw new MCPConnectionError('MCP client is closed')

    const isDefs = Array.isArray(defsOrOptions)
    const options: ToolsOptions = isDefs
      ? maybeOptions
      : // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        ((defsOrOptions as ToolsOptions) ?? {}) // SDK interop: defsOrOptions may be undefined at runtime even though TS types it as ToolsOptions here

    let tools: Array<McpServerTool>
    if (isDefs) {
      // Explicit path: bind each TanStack toolDefinition to the server by name.
      const available = new Map(
        (await this.#client.listTools()).tools.map((t) => [t.name, t]),
      )
      tools = (defsOrOptions as ReadonlyArray<AnyToolDefinition>).map((def) => {
        const serverTool = available.get(def.name)
        if (!serverTool) throw new MCPToolNotFoundError(def.name)
        // Explicitly binding a task-required tool is an error (it would fail
        // on every callTool with -32600) — unlike discovery, which skips them.
        if (requiresTaskExecution(serverTool))
          throw new MCPTaskRequiredToolError(def.name)
        const bound = def.server(
          makeMcpExecute(this.#client, def.name, Boolean(def.outputSchema)),
        ) as ServerTool
        const existingMcp: unknown = bound.metadata?.mcp
        const mcpBase =
          existingMcp !== null && typeof existingMcp === 'object'
            ? existingMcp
            : {}
        const tool: McpServerTool = {
          ...bound,
          ...(this.prefix ? { name: `${this.prefix}_${def.name}` } : {}),
          ...(options.lazy ? { lazy: true } : {}),
          metadata: {
            ...bound.metadata,
            mcp: { ...mcpBase, ...toolMcpMetadata(serverTool, this.prefix) },
          },
        }
        return tool
      })
    } else {
      // Auto-discovery path.
      const defs = (await this.#client.listTools()).tools
      tools = toServerTools(this.#client, defs, {
        prefix: this.prefix,
        lazy: options.lazy,
      })
    }

    // Local duplicate guard (within one client's own list — applies to both branches).
    const seen = new Set<string>()
    for (const t of tools) {
      if (seen.has(t.name)) throw new DuplicateToolNameError(t.name)
      seen.add(t.name)
    }
    return tools
  }

  async resources(): Promise<Array<Resource>> {
    if (this.#closed) throw new MCPConnectionError('MCP client is closed')
    return (await this.#client.listResources()).resources
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    if (this.#closed) throw new MCPConnectionError('MCP client is closed')
    return this.#client.readResource({ uri })
  }

  async resourceTemplates(): Promise<Array<ResourceTemplate>> {
    if (this.#closed) throw new MCPConnectionError('MCP client is closed')
    return (await this.#client.listResourceTemplates()).resourceTemplates
  }

  async prompts(): Promise<Array<Prompt>> {
    if (this.#closed) throw new MCPConnectionError('MCP client is closed')
    return (await this.#client.listPrompts()).prompts
  }

  async getPrompt(
    name: string,
    args?: Record<string, string>,
  ): Promise<GetPromptResult> {
    if (this.#closed) throw new MCPConnectionError('MCP client is closed')
    return this.#client.getPrompt({ name, arguments: args })
  }

  async callTool(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<Client['callTool']>>> {
    if (this.#closed) throw new MCPConnectionError('MCP client is closed')
    return this.#client.callTool({ name, arguments: args ?? {} })
  }

  async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    await this.#client.close()
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close()
  }
}

export async function createMCPClient<
  TServer extends ServerDescriptor = AutomaticDescriptor,
>(options: MCPClientOptions): Promise<MCPClient<TServer>> {
  const transport = await resolveTransport(options.transport)
  const impl = new MCPClientImpl<TServer>(
    options.prefix,
    options.name,
    options.version,
    // Only a serializable config is reconnectable; a ready-made Transport
    // instance is single-use, so it is not retained as a descriptor.
    isTransportInstance(options.transport) ? undefined : options.transport,
    options.clientOptions,
  )
  await impl.connect(transport)
  return impl
}

/** Test-only: connect directly from a transport instance (skips resolveTransport). */
export async function createMCPClientFromTransport<
  TServer extends ServerDescriptor = AutomaticDescriptor,
>(
  transport: Transport,
  prefix?: string,
  clientOptions?: ClientOptions,
): Promise<MCPClient<TServer>> {
  const impl = new MCPClientImpl<TServer>(
    prefix,
    undefined,
    undefined,
    undefined,
    clientOptions,
  )
  await impl.connect(transport)
  return impl
}
