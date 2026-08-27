import type { AnyServerTool } from '../tools/tool-definition'
import type { ChatMCPOptions, MCPToolSource } from './types'

function bindReadResource(tool: AnyServerTool, source: MCPToolSource): void {
  if (!source.readResource) return
  const meta = (
    tool.metadata as { mcp?: { uiResourceUri?: string } } | undefined
  )?.mcp
  if (!meta?.uiResourceUri) return
  ;(meta as { readResource?: MCPToolSource['readResource'] }).readResource =
    source.readResource.bind(source)
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

  async discover(): Promise<Array<AnyServerTool>> {
    if (this.#sources.length === 0) return []
    try {
      const settled = await Promise.allSettled(
        this.#sources.map((s) => s.tools({ lazy: this.#lazyTools })),
      )
      const tools: Array<AnyServerTool> = []
      const zipped = this.#sources.map(
        (source, i) => [source, settled[i]] as const,
      )
      for (const [source, result] of zipped) {
        if (result === undefined) continue
        if (result.status === 'fulfilled') {
          for (const t of result.value) {
            bindReadResource(t, source)
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
    const isEmptyShouldClose = !this.#shouldClose || this.#sources.length === 0
    if (isEmptyShouldClose) return
    await Promise.allSettled(this.#sources.map((s) => s.close()))
  }
}
