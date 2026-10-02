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
 * the last block of the last user message.
 * Later work adds the `tool_addition` and `tool_removal` blocks here.
 */
export const ANTHROPIC_CACHEABLE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'text',
  'image',
  'document',
  'tool_result',
])

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
 * `null` when that message is not from the user or its last block cannot
 * take a marker.
 */
function markLastUserMessage(
  messages: Array<BetaMessageParam>,
  cacheControl: BetaCacheControlEphemeral,
) {
  const last = messages.at(-1)
  if (last === undefined || last.role !== 'user') return null
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
    ...messages.slice(0, -1),
    {
      ...last,
      content: [
        ...blocks.slice(0, -1),
        withCacheControl(lastBlock, cacheControl),
      ],
    },
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
 * 1. the last tool,
 * 2. the last block of the last message, when it is a user message and the
 *    block type is in {@link ANTHROPIC_CACHEABLE_BLOCK_TYPES},
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

  const tools = request.tools?.map((tool, index, all) =>
    index === all.length - 1 ? withCacheControl(tool, cacheControl) : tool,
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
