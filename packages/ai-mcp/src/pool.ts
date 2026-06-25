import { createMCPClient } from './client'
import { DuplicateToolNameError, MCPConnectionError } from './errors'
import type { MCPClient } from './client'
import type { MCPClientOptions, ServerDescriptor, ToolsOptions } from './types'
import type { TransportConfig } from './transport'
import type { ServerTool } from '@tanstack/ai'
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
  tools: (options?: ToolsOptions) => Promise<Array<ServerTool>>
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

  // Cast via `unknown`: the runtime map is descriptor-agnostic
  // (`MCPClient<ServerDescriptor>` values), but per-key the public type is the
  // narrowed `MCPClient<TServers[K]>`. Those no longer structurally overlap
  // because `tools()` is now descriptor-typed (`DescriptorTools<TServer>`), yet
  // the generated descriptor is a compile-time overlay only — the runtime
  // values are identical, so the through-`unknown` cast is sound here.
  // eslint-disable-next-line no-restricted-syntax -- descriptor is a compile-time overlay; runtime MCPClient values are identical regardless of TServer
  const clients = Object.fromEntries(ok.map((r) => r.value)) as unknown as {
    [K in keyof TServers]: MCPClient<TServers[K]>
  }

  const pool: MCPClients<TServers> = {
    clients,
    async tools(options?: ToolsOptions): Promise<Array<ServerTool>> {
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
      }
    > {
      // Keyed by config key (serverId / default prefix). Read each underlying
      // client's original descriptor via getInfo().
      return Object.fromEntries(
        Object.entries(clients).map(([key, c]) => [key, c.getInfo()]),
      )
    },
    async readResource(uri: string): Promise<ReadResourceResult> {
      // Ownership isn't tracked, so try each client. A non-owning server may
      // resolve an unrelated URI, so only accept a result whose `contents`
      // actually include the requested `uri`; otherwise keep trying. A ui://
      // read must reach the server that owns it.
      let lastError: unknown
      let anyThrew = false
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
          anyThrew = true
          lastError = err
        }
      }
      // Distinguish the two failure modes and never leave `cause` undefined:
      // - at least one client threw → surface the last thrown error as `cause`.
      // - every client responded but none owned the uri → there is no thrown
      //   error to attach, so explain that the uri was not found on any server.
      if (anyThrew) {
        throw new Error(
          `Failed to read MCP resource "${uri}": no client could resolve it (last error attached)`,
          { cause: lastError },
        )
      }
      throw new Error(
        `Failed to read MCP resource "${uri}": no configured MCP server owns this uri`,
      )
    },
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
