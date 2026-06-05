import { createMCPClient } from './client'
import { DuplicateToolNameError, MCPConnectionError } from './errors'
import type { MCPClient } from './client'
import type { MCPClientOptions, ServerDescriptor, ToolsOptions } from './types'
import type { ServerTool } from '@tanstack/ai'

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
    throw new MCPConnectionError(
      `Failed to connect MCP server(s): ${failed.join(', ')}`,
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
