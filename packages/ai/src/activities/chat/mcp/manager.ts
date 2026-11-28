import type { AnyServerTool } from '../tools/tool-definition'
import type { ContentPart, ModelMessage } from '../../../types'
import { mcpPromptToMessages } from './prompt-messages'
import { mcpResourceToContentPart } from './resource-parts'
import type {
  ChatMCPAttachResources,
  ChatMCPOptions,
  ChatMCPPrompt,
  ChatMCPPromptRef,
  ChatMCPResolvedContext,
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

function annotationScore(tool: AnyServerTool): number {
  const annotations = (
    tool.metadata as
      | {
          mcp?: {
            annotations?: {
              readOnlyHint?: boolean
              destructiveHint?: boolean
            }
          }
        }
      | undefined
  )?.mcp?.annotations
  let score = 0
  if (annotations?.readOnlyHint) score += 2
  if (annotations?.destructiveHint) score -= 1
  return score
}

function rankTools(
  tools: Array<AnyServerTool>,
  rank: ChatMCPOptions['rankTools'],
): Array<AnyServerTool> {
  if (!rank) return tools
  const scored = tools.map((tool, index) => ({
    tool,
    index,
    score: typeof rank === 'function' ? rank(tool) : annotationScore(tool),
  }))
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.map((s) => s.tool)
}

function applyMaxTools(
  tools: Array<AnyServerTool>,
  maxTools: number | undefined,
): Array<AnyServerTool> {
  if (maxTools === undefined || tools.length <= maxTools) return tools
  const kept = tools.slice(0, maxTools)
  const rest = tools.slice(maxTools).map((t) => ({ ...t, lazy: true as const }))
  return [...kept, ...rest]
}

function normalizePrompts(prompts: ChatMCPPrompt): Array<ChatMCPPromptRef> {
  if (Array.isArray(prompts)) return [...prompts]
  return [prompts]
}

async function readUriFromSources(
  sources: ReadonlyArray<MCPToolSource>,
  uri: string,
  requestMeta: MCPRequestMeta | undefined,
): Promise<McpResourceReadResult | undefined> {
  const errors: Array<unknown> = []
  for (const source of sources) {
    if (!source.readResource) continue
    try {
      const meta = await requestMeta?.({
        method: 'resources/read',
        serverId: undefined,
        uri,
      })
      const result = await source.readResource(uri, {
        ...(meta && { meta }),
      })
      // Match pool.readResource: only accept a result that includes the
      // requested URI so a non-owning server does not stop the fallback.
      if (result.contents.some((entry) => entry.uri === uri)) {
        return result
      }
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `Failed to read MCP resource "${uri}" from any client`,
    )
  }
  return undefined
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
  readonly #maxTools?: number
  readonly #rankTools?: ChatMCPOptions['rankTools']
  readonly #attachResources?: ChatMCPAttachResources
  readonly #prompts?: ChatMCPPrompt
  readonly #resourcePartOptions?: ChatMCPOptions['resourcePartOptions']
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
    this.#maxTools = options?.maxTools
    this.#rankTools = options?.rankTools
    this.#attachResources = options?.attachResources
    this.#prompts = options?.prompts
    this.#resourcePartOptions = options?.resourcePartOptions
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
      const ranked = rankTools(tools, this.#rankTools)
      return applyMaxTools(ranked, this.#maxTools)
    } catch (err) {
      await this.dispose() // cleanup-on-failure (no-op if keep-alive)
      throw err
    }
  }

  /**
   * Resolve `attachResources` / `prompts` into messages and content parts.
   * Safe to call with no options — returns empty arrays.
   */
  async resolveContext(signal?: AbortSignal): Promise<ChatMCPResolvedContext> {
    const promptMessages: Array<ModelMessage> = []
    const contentParts: Array<ContentPart> = []

    if (this.#prompts) {
      for (const ref of normalizePrompts(this.#prompts)) {
        let resolved = false
        const errors: Array<unknown> = []
        for (const source of this.#sources) {
          if (!source.getPrompt) continue
          try {
            const prompt = await source.getPrompt(ref.name, ref.args, {
              ...(signal && { signal }),
            })
            promptMessages.push(...mcpPromptToMessages(prompt))
            resolved = true
            break
          } catch (error) {
            errors.push(error)
          }
        }
        if (!resolved) {
          throw new Error(
            errors.length > 0
              ? `MCP prompt "${ref.name}" failed on every mcp.clients source`
              : `MCP prompt "${ref.name}" was not found on any mcp.clients source`,
            {
              cause:
                errors.length > 0 ? new AggregateError(errors) : undefined,
            },
          )
        }
      }
    }

    if (this.#attachResources) {
      const uris = await this.#resolveResourceUris(this.#attachResources, signal)
      for (const uri of uris) {
        const result = await readUriFromSources(
          this.#sources,
          uri,
          this.#requestMeta,
        )
        if (!result) {
          throw new Error(
            `Failed to read MCP resource "${uri}": no configured MCP server owns this uri`,
          )
        }
        const before = contentParts.length
        for (const block of result.contents) {
          const part = mcpResourceToContentPart(block, this.#resourcePartOptions)
          if (part) contentParts.push(part)
        }
        // onReject: 'omit' can drop every block; do not pretend the attach worked.
        if (result.contents.length > 0 && contentParts.length === before) {
          throw new Error(
            `MCP resource "${uri}" was read but every content block was omitted ` +
              `(resourcePartOptions.onReject: 'omit')`,
          )
        }
      }
    }

    return { promptMessages, contentParts }
  }

  async #resolveResourceUris(
    attach: ChatMCPAttachResources,
    signal?: AbortSignal,
  ): Promise<Array<string>> {
    if ('uris' in attach) return [...attach.uris]
    const max = attach.max ?? 8
    const uris: Array<string> = []
    const errors: Array<unknown> = []
    let listAttempts = 0
    let listFailures = 0
    for (const source of this.#sources) {
      const list = source.listResources ?? source.resources
      if (!list) continue
      listAttempts += 1
      try {
        const listed = await list.call(source, {
          ...(signal && { signal }),
        })
        for (const item of listed) {
          if (uris.length >= max) return uris
          if (!uris.includes(item.uri)) uris.push(item.uri)
        }
      } catch (error) {
        listFailures += 1
        errors.push(error)
      }
    }
    if (
      uris.length === 0 &&
      listAttempts > 0 &&
      listFailures === listAttempts
    ) {
      throw new Error(
        'Failed to list MCP resources from every mcp.clients source',
        {
          cause: new AggregateError(errors),
        },
      )
    }
    return uris
  }

  /** Close sources iff policy is 'close'. Idempotent; never throws. */
  async dispose(): Promise<void> {
    if (!this.#shouldClose || this.#sources.length === 0) return
    // Wrap so a sync throw from close() becomes a rejection allSettled swallows.
    await Promise.allSettled(
      this.#sources.map((s) => Promise.resolve().then(() => s.close())),
    )
  }
}

/**
 * Merge resolved MCP context into a chat message list.
 * Prompt messages are prepended. Content parts append to the last user
 * message, or create a user message when none exists.
 *
 * When the last user message is a UIMessage (`parts` present), parts are
 * updated so `convertMessagesToModelMessages` keeps the MCP content.
 */
export function mergeMcpContextIntoMessages(
  messages: ReadonlyArray<ModelMessage>,
  context: ChatMCPResolvedContext,
): Array<ModelMessage> {
  let next: Array<ModelMessage> = [
    ...context.promptMessages,
    ...messages.map((m) => ({ ...m })),
  ]
  if (context.contentParts.length === 0) return next

  let lastUserIndex = -1
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i]?.role === 'user') {
      lastUserIndex = i
      break
    }
  }

  if (lastUserIndex === -1) {
    next = [
      ...next,
      { role: 'user', content: context.contentParts },
    ]
    return next
  }

  const user = next[lastUserIndex]! as ModelMessage & {
    parts?: Array<ContentPart>
  }
  if (Array.isArray(user.parts)) {
    next[lastUserIndex] = {
      ...user,
      parts: [...user.parts, ...context.contentParts],
    } as ModelMessage
    return next
  }

  const existing = user.content
  const parts: Array<ContentPart> =
    typeof existing === 'string'
      ? [{ type: 'text', content: existing }, ...context.contentParts]
      : Array.isArray(existing)
        ? [...existing, ...context.contentParts]
        : [...context.contentParts]
  next[lastUserIndex] = { ...user, content: parts }
  return next
}
