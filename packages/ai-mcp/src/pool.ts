import { createMCPClient } from './client'
import { DuplicateToolNameError, MCPConnectionError } from './errors'
import type { MCPClient } from './client'
import type {
  MCPClientOptions,
  McpServerTool,
  ServerDescriptor,
  ToolsOptions,
} from './types'
import type { ClientOptions } from '@modelcontextprotocol/sdk/client/index.js'
import type { TransportConfig } from './transport'
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'

export type MCPClientsConfig = Record<string, MCPClientOptions>

export interface MCPClients<
  TServers extends Record<string, ServerDescriptor> = Record<
    string,
    ServerDescriptor
  >,
> {
  /** Typed per-server access (typed defs, resources, prompts on one server). */
  readonly clients: { [K in keyof TServers]: MCPClient<TServers[K]> }
  /**
     * All servers' tools, flattened and auto-prefixed by config key.
     * `options` (including `lazy`) is forwarded to every client's `tools()`.
     */
  tools: (options?: ToolsOptions) => Promise<Array<McpServerTool>>
  /**
     * Reads an MCP resource by URI, routing to the owning client. A `ui://`
     * resource read must hit the server that owns it; since the pool does not
     * track ownership, each underlying client is tried in turn and the first
     * success is returned. If every client fails, the last error is thrown.
     *
     * Required so a pool source emits `ui-resource` events for MCP Apps widgets
     * (the chat manager binds `readResource` only when the source exposes it).
     */
  readResource: (uri: string) => Promise<ReadResourceResult>
  /**
     * The connection descriptors for every server in the pool, keyed by config
     * key (the serverId / default prefix). Used by `createMcpAppCallHandler` to
     * reconnect per-call (serverless-safe) without a separate transport-config
     * map. Each value mirrors the owning client's `getInfo()`.
     */
  getServers: () => Record<
    string,
    {
      transport: TransportConfig | undefined
      prefix: string | undefined
      clientOptions?: ClientOptions
    }
  >
  /** Close every client. */
  close: () => Promise<void>
  [Symbol.asyncDispose]: () => Promise<void>
}

export async function createMCPClients<
  TServers extends Record<string, ServerDescriptor> = Record<
    string,
    ServerDescriptor
  >,
>(
  // When TServers is a generated `MCPServers` map, the config keys are
  // constrained to the declared servers (missing/typo'd key → compile error).
  config: { [K in keyof TServers]: MCPClientOptions } & MCPClientsConfig,
): Promise<MCPClients<TServers>> {
  const names = Object.keys(config)

  // Connect all in parallel; on any failure, close the successes and throw once.
  const settled = await Promise.allSettled(
    names.map(async (name) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const opts = config[name]!
      // default prefix = config key; `prefix: ''` disables; explicit string wins
      const prefix = opts.prefix === undefined ? name : opts.prefix || undefined
      const client = await createMCPClient({ ...opts, prefix })
      return [name, client] as const
    }),
  )

  const ok = settled.filter(
    (
      r,
    ): r is PromiseFulfilledResult<
      readonly [string, MCPClient<ServerDescriptor>]
    > => r.status === 'fulfilled',
  )
  const failed = settled
    .map((r, i) => (r.status === 'rejected' ? names[i] : null))
    .filter((n): n is string => n !== null)

  if (failed.length > 0) {
    // Cleanup already-connected clients — no leaks.
    await Promise.allSettled(ok.map((r) => r.value[1].close()))
    // Attach the first rejection's reason as the cause so the underlying
    // connect error isn't lost (mirrors the tools() path).
    const firstRejection = settled.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    )
    throw new MCPConnectionError(
      `Failed to connect MCP server(s): ${failed.join(', ')}`,
      firstRejection?.reason,
    )
  }

  /** Typed per-server access (typed defs, resources, prompts on one server). */
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- descriptor is a compile-time overlay; runtime MCPClient values are identical regardless of TServer
  const clients = Object.fromEntries(ok.map((r) => r.value)) as unknown as {
    [K in keyof TServers]: MCPClient<TServers[K]>
  }

  const pool: MCPClients<TServers> = {
    clients,
    async tools(options?: ToolsOptions): Promise<Array<McpServerTool>> {
      // Settle (like the connect path) so a single failing server is reported
      // by config key instead of rejecting with an unattributed SDK error.
      const entries = Object.entries(clients)
      const results = await Promise.allSettled(
        entries.map(([, c]) =>
          (c as MCPClient<ServerDescriptor>).tools(options),
        ),
      )
      const failedNames = entries
        .map(([key], i) => (results[i]?.status === 'rejected' ? key : null))
        .filter((k): k is string => k !== null)
      if (failedNames.length > 0) {
        const firstFailure = results.find(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        )
        throw new MCPConnectionError(
          `Failed to list tools from MCP server(s): ${failedNames.join(', ')}`,
          firstFailure?.reason,
        )
      }
      const all = results.flatMap((r) =>
        r.status === 'fulfilled' ? r.value : [],
      )
      const seen = new Set<string>()
      for (const t of all) {
        if (seen.has(t.name)) throw new DuplicateToolNameError(t.name)
        seen.add(t.name)
      }
      return all
    },
    getServers(): Record<
      string,
      {
        transport: TransportConfig | undefined
        prefix: string | undefined
        clientOptions?: ClientOptions
      }
    > {
      // Keyed by config key (serverId / default prefix). Read each underlying
      // client's original descriptor via getInfo().
      return Object.fromEntries(
        Object.entries(clients).map(([key, c]) => [key, c.getInfo()]),
      )
    },
    async readResource(uri: string): Promise<ReadResourceResult> {
      const errors: Array<unknown> = []
      const all = Object.values(clients)
      for (const c of all) {
        try {
          const result = await (c as MCPClient<ServerDescriptor>).readResource(
            uri,
          )
          if (result.contents.some((entry) => entry.uri === uri)) {
            return result
          }
        } catch (err) {
          errors.push(err)
        }
      }
      if (errors.length > 0) {
        throw new Error(
          `Failed to read MCP resource "${uri}": no client could resolve it (${errors.length} error(s) attached)`,
          { cause: new AggregateError(errors) },
        )
      }
      throw new Error(
        `Failed to read MCP resource "${uri}": no configured MCP server owns this uri`,
      )
    },
    /** Close every client. */
    async close(): Promise<void> {
      await Promise.all(
        Object.values(clients).map((c) =>
          (c as MCPClient<ServerDescriptor>).close(),
        ),
      )
    },
    async [Symbol.asyncDispose](): Promise<void> {
      await pool.close()
    },
  }

  return pool
}
