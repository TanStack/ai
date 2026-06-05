import type { ServerTool } from '../tools/tool-definition'
import type { ChatMCPOptions, MCPToolSource } from './types'

export class MCPDuplicateToolNameError extends Error {
  constructor(public readonly toolName: string) {
    super(
      `Duplicate MCP tool name "${toolName}" in chat({ mcp.clients }). ` +
        `Set a unique \`prefix\` on one of the MCP clients (or use a pool, ` +
        `which auto-prefixes) to disambiguate.`,
    )
    this.name = 'MCPDuplicateToolNameError'
  }
}

/**
 * Encapsulates MCP tool discovery + connection lifecycle for chat().
 * Built from chat()'s `mcp` option; runners only call `discover()` then
 * `dispose()`. A manager built from `undefined` is an inert no-op
 * (`discover()` → `[]`, `dispose()` → no-op), so runners need no branching.
 */
export class MCPManager {
  static from(options: ChatMCPOptions | undefined): MCPManager {
    return new MCPManager(options)
  }

  readonly #sources: ReadonlyArray<MCPToolSource>
  readonly #shouldClose: boolean
  readonly #lazyTools: boolean
  readonly #onDiscoveryError?: (
    error: unknown,
    source: MCPToolSource,
  ) => void | Promise<void>

  private constructor(options: ChatMCPOptions | undefined) {
    this.#sources = options?.clients ?? []
    // default 'close'; only 'keep-alive' disables closing
    this.#shouldClose = options ? options.connection !== 'keep-alive' : false
    this.#lazyTools = options?.lazyTools ?? false
    this.#onDiscoveryError = options?.onDiscoveryError
  }

  /**
   * Discover + merge tools from all sources. Throws on a fatal discovery error
   * (no `onDiscoveryError`, or it re-threw) or a duplicate tool name; in that
   * case it first closes any connected sources when the policy is 'close'.
   */
  async discover(): Promise<Array<ServerTool>> {
    if (this.#sources.length === 0) return []
    try {
      const settled = await Promise.allSettled(
        this.#sources.map((s) => s.tools({ lazy: this.#lazyTools })),
      )
      const tools: Array<ServerTool> = []
      const zipped = this.#sources.map(
        (source, i) => [source, settled[i]] as const,
      )
      for (const [source, result] of zipped) {
        if (result === undefined) continue
        if (result.status === 'fulfilled') {
          tools.push(...result.value)
        } else if (this.#onDiscoveryError) {
          // throw/reject inside handler ⇒ propagate (fail-fast); return ⇒ skip
          await this.#onDiscoveryError(result.reason, source)
        } else {
          throw result.reason
        }
      }
      const seen = new Set<string>()
      for (const t of tools) {
        if (seen.has(t.name)) throw new MCPDuplicateToolNameError(t.name)
        seen.add(t.name)
      }
      return tools
    } catch (err) {
      await this.dispose() // cleanup-on-failure (no-op if keep-alive)
      throw err
    }
  }

  /** Close sources iff policy is 'close'. Idempotent; never throws. */
  async dispose(): Promise<void> {
    if (!this.#shouldClose || this.#sources.length === 0) return
    await Promise.allSettled(this.#sources.map((s) => s.close()))
  }
}
