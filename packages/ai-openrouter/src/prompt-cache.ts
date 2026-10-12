import type { ResolvedPromptCache } from '@tanstack/ai'
import type {
  ChatContentCacheControl,
  ChatMessages,
  ChatRequest,
} from '@openrouter/sdk/models'

type OpenRouterChatRequest = Omit<ChatRequest, 'stream'>

/** True when one of the items already has a cache marker. */
function hasMarker(items: ReadonlyArray<object> | undefined) {
  return items?.some((item) => 'cacheControl' in item) ?? false
}

/**
 * Put the marker on the last text block that is not empty. A string becomes
 * one text block. An empty string does not change.
 */
function markLastText<TPart extends { type: string }>(
  content: string | Array<TPart>,
  cacheControl: ChatContentCacheControl,
) {
  if (typeof content === 'string') {
    return content === ''
      ? content
      : [{ type: 'text' as const, text: content, cacheControl }]
  }
  const index = content.findLastIndex(
    (part) => part.type === 'text' && 'text' in part && part.text !== '',
  )
  return content.map((part, i) =>
    i === index ? { ...part, cacheControl } : part,
  )
}

/** Put the marker on the last text block of one message. */
function markMessage(
  message: ChatMessages,
  cacheControl: ChatContentCacheControl,
) {
  switch (message.role) {
    // A system message has its own case: it takes only text blocks.
    case 'system':
      return {
        ...message,
        content: markLastText(message.content, cacheControl),
      }
    case 'user':
    case 'tool':
      return {
        ...message,
        content: markLastText(message.content, cacheControl),
      }
    case 'assistant':
      // The converter gives an assistant a string, or null when the message
      // has only tool calls. Null has no text to mark.
      return typeof message.content === 'string'
        ? { ...message, content: markLastText(message.content, cacheControl) }
        : message
    case 'developer':
      // The converter never makes a developer message.
      return message
  }
}

/**
 * Add the automatic prompt cache fields for `chat({ promptCache })` to an
 * OpenRouter chat request.
 *
 * - The cache key becomes `sessionId` on every model, so OpenRouter sends the
 *   requests of one session to the same provider. A `sessionId` from
 *   `modelOptions` wins.
 * - Only `anthropic/*` models get cache markers, and only when the request
 *   has no manual marker (system prompt, tool, or content block). Then the
 *   system message, the last function tool, and the last message each get a
 *   marker on their last text block.
 *
 * `'none'` returns the request with no change. `'long'` asks for the 1-hour
 * TTL. The function returns a new request and does not change `request`.
 */
export function addPromptCacheMarkers(
  request: OpenRouterChatRequest,
  promptCache: ResolvedPromptCache,
) {
  if (promptCache.retention === 'none') return request
  // OpenRouter accepts a session id of at most 256 characters.
  const key =
    promptCache.key && Array.from(promptCache.key).slice(0, 256).join('')
  const sessionId = request.sessionId ?? key
  const withSession = { ...request, ...(sessionId && { sessionId }) }

  const isClaude = request.model?.startsWith('anthropic/') ?? false
  const hasManualMarker =
    hasMarker(request.tools) ||
    request.messages.some(
      (message) => Array.isArray(message.content) && hasMarker(message.content),
    )
  if (!isClaude || hasManualMarker) return withSession

  const cacheControl: ChatContentCacheControl =
    promptCache.retention === 'long'
      ? { type: 'ephemeral', ttl: '1h' }
      : { type: 'ephemeral' }
  const lastMessage = request.messages.length - 1
  const lastTool =
    request.tools?.findLastIndex((tool) => tool.type === 'function') ?? -1
  return {
    ...withSession,
    messages: request.messages.map((message, i) =>
      message.role === 'system' || i === lastMessage
        ? markMessage(message, cacheControl)
        : message,
    ),
    ...(request.tools && {
      tools: request.tools.map((tool, i) =>
        i === lastTool ? { ...tool, cacheControl } : tool,
      ),
    }),
  }
}
