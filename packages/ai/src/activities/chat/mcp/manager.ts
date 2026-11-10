import type { AnyServerTool } from '../tools/tool-definition'
import type {
  ChatMCPOptions,
  MCPRequestMeta,
  MCPToolSource,
  McpResourceReadResult,
} from './types'

/**
 * Bind a read of the source's resources onto a ui-linked tool's `metadata.mcp`
 * so it travels with the tool to the server-tool execution/emit site
 * (`tool-calls.ts`).
 *
 * The bound read sends the tool's `serverId` to the source. When the run has a
 * `requestMeta` hook, the read first calls the hook with
 * `{ method: 'resources/read', serverId, uri }` and sends the result as `meta`.
 * If the hook throws or rejects, the bound read rejects. The emit site fails
 * soft on that, the same as on any other read error.
 *
 * `discover()` is the single place in `@tanstack/ai` that has both a tool and
 * its originating source, and `@tanstack/ai` must not import `@tanstack/ai-mcp`,
 * so this is where the source handle is threaded onto the tool. Only tools that
 * actually link a `ui://` resource (their discovery stamped
 * `metadata.mcp.uiResourceUri`) and whose source can read resources get bound;
 * everything else is left untouched.
 *
 * This mutates the discovered tool's `metadata.mcp` in place. That is safe
 * because discovery returns fresh tool objects per `discover()` call: the bound
 * `readResource` closes over `source`, whose connection stays live until the run
 * drains. If discovery results were ever cached and reused across runs, this
 * would bind a closure over an already-closed source — bind onto a copy then.
 */
function bindReadResource(
  tool: AnyServerTool,
  source: MCPToolSource,
  requestMeta: MCPRequestMeta | undefined,
): void {
  if (!source.readResource) return
  const mcp = (
    tool.metadata as
      | {
          mcp?: {
            uiResourceUri?: string
            serverId?: string
            readResource?: (uri: string) => Promise<McpResourceReadResult>
          }
        }
      | undefined
  )?.mcp
  if (!mcp?.uiResourceUri) return
  const read = source.readResource.bind(source)
  const { serverId } = mcp
  mcp.readResource = async (uri) => {
    const meta = await requestMeta?.({
      method: 'resources/read',
      serverId,
      uri,
    })
    return read(uri, {
      ...(serverId !== undefined && { serverId }),
      ...(meta && { meta }),
    })
  }
}

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
  readonly #requestMeta?: MCPRequestMeta
  readonly #onDiscoveryError?: (
    error: unknown,
    source: MCPToolSource,
  ) => void | Promise<void>

  private constructor(options: ChatMCPOptions | undefined) {
    this.#sources = options?.clients ?? []
    // default 'close'; only 'keep-alive' disables closing
    this.#shouldClose = options ? options.connection !== 'keep-alive' : false
    this.#lazyTools = options?.lazyTools ?? false
    this.#requestMeta = options?.requestMeta
    this.#onDiscoveryError = options?.onDiscoveryError
  }

  /**
   * Discover + merge tools from all sources. Throws on a fatal discovery error
   * (no `onDiscoveryError`, or it re-threw) or a duplicate tool name; in that
   * case it first closes any connected sources when the policy is 'close'.
   * `signal` (the chat run signal) and `requestMeta` (when set) go to each
   * source's `tools()`.
   */
  async discover(signal?: AbortSignal): Promise<Array<AnyServerTool>> {
    if (this.#sources.length === 0) return []
    const requestMeta = this.#requestMeta
    try {
      const settled = await Promise.allSettled(
        this.#sources.map((s) =>
          s.tools({
            lazy: this.#lazyTools,
            ...(signal && { signal }),
            ...(requestMeta && { requestMeta }),
          }),
        ),
      )
      const tools: Array<AnyServerTool> = []
      const zipped = this.#sources.map(
        (source, i) => [source, settled[i]] as const,
      )
      for (const [source, result] of zipped) {
        if (result === undefined) continue
        if (result.status === 'fulfilled') {
          for (const t of result.value) {
            bindReadResource(t, source, requestMeta)
            tools.push(t)
          }
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
