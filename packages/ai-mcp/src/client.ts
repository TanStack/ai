import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  DuplicateToolNameError,
  MCPConnectionError,
  MCPToolNotFoundError,
} from './errors'
import { makeMcpExecute, toServerTools } from './tools'
import { resolveTransport } from './transport'
import type {
  AnyToolDefinition,
  AutomaticDescriptor,
  MCPClientOptions,
  MappedServerTools,
  ServerDescriptor,
  ToolsOptions,
} from './types'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { ServerTool } from '@tanstack/ai'

export interface MCPClient<
  TServer extends ServerDescriptor = AutomaticDescriptor,
> {
  readonly capabilities: TServer['capabilities']
  /** Auto-discovery: every server tool as a ServerTool (args typed `unknown`). */
  tools: {
    (options?: ToolsOptions): Promise<Array<ServerTool>>
    /** Explicit: bind these TanStack toolDefinitions to the server (typed + validated, allowlist). */
    <const TDefs extends ReadonlyArray<AnyToolDefinition>>(
      defs: TDefs,
      options?: ToolsOptions,
    ): Promise<MappedServerTools<TDefs>>
  }
  // resources()/readResource()/prompts()/getPrompt() added in Phase 4.
  close: () => Promise<void>
  [Symbol.asyncDispose]: () => Promise<void>
}

class MCPClientImpl<TServer extends ServerDescriptor>
  implements MCPClient<TServer>
{
  capabilities: TServer['capabilities'] = {}
  readonly #client: Client
  #closed = false
  private readonly prefix?: string

  constructor(
    prefix?: string,
    name = 'tanstack-ai-mcp',
    version = '0.0.1',
  ) {
    this.prefix = prefix
    this.#client = new Client({ name, version })
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
  ): Promise<Array<ServerTool>> {
    if (this.#closed) throw new MCPConnectionError('MCP client is closed')

    const isDefs = Array.isArray(defsOrOptions)
    const options: ToolsOptions = isDefs
      ? maybeOptions
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      : ((defsOrOptions as ToolsOptions) ?? {}) // SDK interop: defsOrOptions may be undefined at runtime even though TS types it as ToolsOptions here

    let tools: Array<ServerTool>
    if (isDefs) {
      // Explicit path: bind each TanStack toolDefinition to the server by name.
      const available = new Set(
        (await this.#client.listTools()).tools.map((t) => t.name),
      )
      tools = (defsOrOptions as ReadonlyArray<AnyToolDefinition>).map((def) => {
        if (!available.has(def.name)) throw new MCPToolNotFoundError(def.name)
        const tool = def.server(
          makeMcpExecute(this.#client, def.name, Boolean(def.outputSchema)),
        ) as ServerTool
        if (this.prefix) tool.name = `${this.prefix}_${def.name}`
        if (options.lazy) tool.lazy = true
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
  )
  await impl.connect(transport)
  return impl
}

/** Test-only: connect directly from a transport instance (skips resolveTransport). */
export async function createMCPClientFromTransport<
  TServer extends ServerDescriptor = AutomaticDescriptor,
>(transport: Transport, prefix?: string): Promise<MCPClient<TServer>> {
  const impl = new MCPClientImpl<TServer>(prefix)
  await impl.connect(transport)
  return impl
}
