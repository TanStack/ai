import type { ResolvedPromptCache } from '@tanstack/ai'
import type {
  BetaCacheControlEphemeral,
  BetaContentBlockParam,
  BetaMessageParam,
} from '@anthropic-ai/sdk/resources/beta/messages'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import type { InternalTextProviderOptions } from './text/text-provider-options'

/**
 * The block types that can take the automatic cache marker when they are
 * the last block of the last user message, or of a mid-conversation
 * `system` message at the end.
 */
export const ANTHROPIC_CACHEABLE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'text',
  'image',
  'document',
  'tool_result',
  'tool_addition',
  'tool_removal',
])

/**
 * The name of the deferred placeholder tool of mid-conversation tool mode.
 * The text adapter puts it on the placeholder, and the cache markers find
 * the placeholder by it.
 */
export const ANTHROPIC_DEFERRED_TOOL_PLACEHOLDER_NAME =
  '__tanstack_deferred_placeholder__'

// Anthropic rejects a request with more than 4 cache markers.
const MAX_CACHE_MARKERS = 4

// `null` and `undefined` are not markers: custom tools always send
// `cache_control: null` when the caller set none.
function hasCacheControl(item: object) {
  return 'cache_control' in item && item.cache_control != null
}

function blockHasCacheControl(block: BetaContentBlockParam) {
  // A marker inside a tool result also counts toward the limit of 4.
  const isMarkedToolResult =
    block.type === 'tool_result' &&
    Array.isArray(block.content) &&
    block.content.some(hasCacheControl)
  return hasCacheControl(block) || isMarkedToolResult
}

function hasManualCacheControl(request: InternalTextProviderOptions) {
  const systemBlocks = Array.isArray(request.system) ? request.system : []
  const tools = request.tools ?? []
  const hasMessageMarker = request.messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some(blockHasCacheControl),
  )
  return (
    request.cache_control != null ||
    systemBlocks.some(hasCacheControl) ||
    tools.some(hasCacheControl) ||
    hasMessageMarker
  )
}

function withCacheControl<T extends object>(
  item: T,
  cacheControl: BetaCacheControlEphemeral,
) {
  return { ...item, cache_control: cacheControl }
}

/**
 * The messages with a marker on the last block of the last message. Returns
 * `null` when that message is not from the user or a mid-conversation
 * `system` message, or when its last block cannot take a marker. A
 * mid-conversation effort message at the end has no blocks, so the marker
 * goes on the message before it (pi 0.87.1 marks before it adds them).
 */
function markLastUserMessage(
  messages: Array<BetaMessageParam>,
  cacheControl: BetaCacheControlEphemeral,
) {
  const tail = messages.at(-1)
  const end =
    tail !== undefined && 'output_config' in tail
      ? messages.length - 1
      : messages.length
  const last = messages[end - 1]
  // A mid-conversation `system` message at the end takes the marker, as in
  // pi 0.87.1. The SDK type has no `system` role, so compare it as a string.
  const role: string | undefined = last?.role
  if (last === undefined || (role !== 'user' && role !== 'system')) {
    return null
  }
  const blocks: Array<BetaContentBlockParam> =
    typeof last.content !== 'string'
      ? last.content
      : last.content
        ? [{ type: 'text', text: last.content }]
        : []
  const lastBlock = blocks.at(-1)
  if (
    lastBlock === undefined ||
    !ANTHROPIC_CACHEABLE_BLOCK_TYPES.has(lastBlock.type)
  ) {
    return null
  }
  return [
    ...messages.slice(0, end - 1),
    {
      ...last,
      content: [
        ...blocks.slice(0, -1),
        withCacheControl(lastBlock, cacheControl),
      ],
    },
    ...messages.slice(end),
  ]
}

/**
 * Adds Anthropic cache markers to a Messages request, so a later request
 * with the same start reads it from the cache.
 *
 * It adds nothing when `promptCache` is absent or `'none'`, or when the
 * request already has a marker of the caller's (on a system block, a message
 * block, a tool, or the top-level `cache_control`). Otherwise it marks, with
 * at most 4 markers:
 * 1. the last tool. In mid-conversation tool mode (the tools hold the
 *    placeholder), the last start tool, right before the placeholder,
 * 2. the last block of the last message, when it is a user message or a
 *    mid-conversation `system` message and the block type is in
 *    {@link ANTHROPIC_CACHEABLE_BLOCK_TYPES},
 * 3. the system blocks from the end, with the markers that are left.
 *
 * It does not change the request it gets. It returns a new request, or the
 * same request when it adds nothing.
 *
 * @param request - The finished Messages request.
 * @param promptCache - The `promptCache` that `chat()` resolved.
 *
 * @example
 * const body = applyAnthropicPromptCache(request, { retention: 'short' })
 */
export function applyAnthropicPromptCache(
  request: InternalTextProviderOptions,
  promptCache: ResolvedPromptCache | undefined,
) {
  const retention = promptCache?.retention ?? 'none'
  if (retention === 'none' || hasManualCacheControl(request)) return request

  const cacheControl: BetaCacheControlEphemeral =
    retention === 'long'
      ? { type: 'ephemeral', ttl: '1h' }
      : { type: 'ephemeral' }

  // Mid-conversation tool mode: the placeholder and the deferred added tools
  // are not in the cached start, so the marker goes on the last start tool,
  // right before the placeholder (pi 0.87.1). Without the placeholder, the
  // last tool, as before.
  const placeholder =
    request.tools?.findIndex(
      (tool) => tool.name === ANTHROPIC_DEFERRED_TOOL_PLACEHOLDER_NAME,
    ) ?? -1
  const tools = request.tools?.map((tool, index, all) =>
    index === (placeholder > 0 ? placeholder - 1 : all.length - 1)
      ? withCacheControl(tool, cacheControl)
      : tool,
  )
  const messages = markLastUserMessage(request.messages, cacheControl)

  const usedMarkers = (tools?.length ? 1 : 0) + (messages ? 1 : 0)
  const systemBlocks: Array<TextBlockParam> =
    typeof request.system !== 'string'
      ? (request.system ?? [])
      : request.system
        ? [{ type: 'text', text: request.system }]
        : []
  const firstMarkedSystem =
    systemBlocks.length - (MAX_CACHE_MARKERS - usedMarkers)
  const system = systemBlocks.map((block, index) =>
    index >= firstMarkedSystem ? withCacheControl(block, cacheControl) : block,
  )

  return {
    ...request,
    ...(tools && { tools }),
    ...(system.length > 0 && { system }),
    ...(messages && { messages }),
  }
}
