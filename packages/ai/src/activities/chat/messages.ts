import { isProviderExecutedToolCall } from '../../utilities/provider-executed'
import { normalizeToolResult } from '../../utilities/tool-result'
import type { Message as AGUIMessage } from '@ag-ui/core'
import type {
  ContentPart,
  MessagePart,
  ModelMessage,
  TextPart,
  ToolCallPart,
  UIMessage,
} from '../../types'
// ===========================
// Message Converters
// ===========================

/**
 * Check if a MessagePart is a content part (text, image, audio, video, document)
 * that maps directly to a ModelMessage ContentPart.
 */
function isContentPart(part: MessagePart): part is ContentPart {
  return (
    part.type === 'text' ||
    part.type === 'image' ||
    part.type === 'audio' ||
    part.type === 'video' ||
    part.type === 'document'
  )
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function parseToolResultContent(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}

/**
 * Collapse an array of ContentParts into the most compact ModelMessage content:
 * - Empty array → null
 * - All text parts → joined string (or null if empty)
 * - Mixed content → ContentPart array as-is
 */
function collapseContentParts(
  parts: Array<ContentPart>,
): string | null | Array<ContentPart> {
  if (parts.length === 0) return null

  const allText = parts.every((p) => p.type === 'text')
  if (allText) {
    const joined = parts.map((p) => p.content).join('')
    return joined || null
  }

  return parts
}

/**
 * Extract text content from ModelMessage content (string, null, or ContentPart array).
 * Used when only the text portion is needed (e.g., tool result content).
 */
function getTextContent(content: string | null | Array<ContentPart>): string {
  if (content === null) return ''
  if (typeof content === 'string') return content
  return content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.content)
    .join('')
}

/**
 * Convert UIMessages or ModelMessages to ModelMessages
 */
export function convertMessagesToModelMessages(
  messages: Array<UIMessage | ModelMessage>,
): Array<ModelMessage> {
  // Pre-pass: collect toolCallIds already represented in anchor UIMessage parts.
  // Fan-out tool messages whose toolCallId matches an anchored ToolResultPart
  // are AG-UI duplicates and must be dropped to avoid double-feeding the LLM.
  const anchoredToolCallIds = new Set<string>()
  for (const msg of messages) {
    if ('parts' in msg) {
      for (const part of msg.parts) {
        if (part.type === 'tool-result') {
          anchoredToolCallIds.add(part.toolCallId)
        }
      }
    }
  }

  const modelMessages: Array<ModelMessage> = []
  for (const msg of messages) {
    if ('parts' in msg) {
      // UIMessage anchor — existing fan-out path
      modelMessages.push(...uiMessageToModelMessages(msg))
      continue
    }

    const role = (msg as { role: string }).role

    // AG-UI tool fan-out duplicate — drop if anchor already covers it
    if (
      role === 'tool' &&
      msg.toolCallId &&
      anchoredToolCallIds.has(msg.toolCallId)
    ) {
      continue
    }

    // AG-UI reasoning and activity — no ModelMessage equivalent today
    if (role === 'reasoning' || role === 'activity') {
      continue
    }

    // AG-UI developer — collapse to system
    if (role === 'developer') {
      modelMessages.push({
        role: 'system' as ModelMessage['role'],
        content: (msg as { content: string }).content,
      })
      continue
    }

    // Already a ModelMessage (user, assistant, system, tool with no anchor) — pass through
    modelMessages.push(msg)
  }
  return modelMessages
}

/**
 * Convert a UIMessage to ModelMessage(s)
 *
 * Walks the parts array IN ORDER to preserve the interleaving of text,
 * tool calls, and tool results. This is critical for multi-round tool
 * flows where the model generates text, calls a tool, gets the result,
 * then generates more text and calls another tool.
 *
 * The output preserves the sequential structure:
 *   text1 → toolCall1 → toolResult1 → text2 → toolCall2 → toolResult2
 * becomes:
 *   assistant: {content: "text1", toolCalls: [toolCall1]}
 *   tool: toolResult1
 *   assistant: {content: "text2", toolCalls: [toolCall2]}
 *   tool: toolResult2
 *
 * @param uiMessage - The UIMessage to convert
 * @returns An array of ModelMessages preserving part ordering
 */
export function uiMessageToModelMessages(
  uiMessage: UIMessage,
): Array<ModelMessage> {
  // Skip system messages - they're handled via systemPrompts, not ModelMessages
  if (uiMessage.role === 'system') {
    return []
  }

  // For non-assistant messages (user), use the simpler path since they
  // don't have tool calls or tool results to interleave
  if (uiMessage.role !== 'assistant') {
    return [buildUserOrToolMessage(uiMessage)]
  }

  // For assistant messages, walk parts in order to preserve interleaving
  return buildAssistantMessages(uiMessage)
}

/**
 * Build a single ModelMessage for user messages (simple path).
 * Preserves ordering of text and multimodal content parts.
 */
function buildUserOrToolMessage(uiMessage: UIMessage): ModelMessage {
  const contentParts: Array<ContentPart> = []
  for (const part of uiMessage.parts) {
    if (isContentPart(part)) {
      contentParts.push(part)
    }
  }

  return {
    role: uiMessage.role as 'user' | 'assistant' | 'tool',
    content: collapseContentParts(contentParts),
  }
}

// Accumulator for building an assistant segment (content + tool calls)
interface AssistantSegment {
  contentParts: Array<ContentPart>
  toolCalls: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
    /** Provider-specific metadata that round-trips with the tool call.
     * Untyped at this framework layer; adapters narrow it via their
     * `TToolCallMetadata` generic. */
    metadata?: unknown
  }>
}

function createSegment(): AssistantSegment {
  return { contentParts: [], toolCalls: [] }
}

function isToolCallIncluded(part: ToolCallPart): boolean {
  return (
    part.state === 'input-complete' ||
    part.state === 'complete' ||
    part.state === 'approval-responded' ||
    part.state === 'error' ||
    part.output !== undefined
  )
}

/**
 * Build ModelMessages for an assistant UIMessage, preserving the
 * sequential interleaving of text, tool calls, and tool results.
 *
 * Walks parts in order. Text and tool-call parts accumulate into the
 * current "segment". When a tool-result part is encountered, the
 * current segment is flushed as an assistant message, then the tool
 * result is emitted as a tool message.
 */
function buildAssistantMessages(uiMessage: UIMessage): Array<ModelMessage> {
  const messageList: Array<ModelMessage> = []
  let current = createSegment()
  let pendingThinking: Array<{ content: string; signature?: string }> = []

  // Track emitted tool result IDs to avoid duplicates.
  // A tool call can have BOTH an explicit tool-result part AND an output
  // field on the tool-call part. We only want one per tool call ID.
  const emittedToolResultIds = new Set<string>()

  function flushSegment(): void {
    const content = collapseContentParts(current.contentParts)
    const hasContent = content !== null
    const hasToolCalls = current.toolCalls.length > 0

    if (hasContent || hasToolCalls) {
      messageList.push({
        role: 'assistant',
        content,
        ...(hasToolCalls && { toolCalls: current.toolCalls }),
        ...(pendingThinking.length > 0 && { thinking: pendingThinking }),
      })
      pendingThinking = []
    }
    current = createSegment()
  }

  for (const part of uiMessage.parts) {
    switch (part.type) {
      case 'text':
      case 'image':
      case 'audio':
      case 'video':
      case 'document':
        current.contentParts.push(part)
        break

      case 'tool-call':
        if (isToolCallIncluded(part)) {
          current.toolCalls.push({
            id: part.id,
            type: 'function' as const,
            function: {
              name: part.name,
              arguments: part.arguments,
            },
            ...(part.metadata !== undefined && { metadata: part.metadata }),
          })
        }
        break

      case 'tool-result':
        // Flush the current assistant segment before emitting the tool result
        flushSegment()

        // Emit the tool result
        if (
          (part.state === 'complete' || part.state === 'error') &&
          !emittedToolResultIds.has(part.toolCallId)
        ) {
          messageList.push({
            role: 'tool',
            content: part.content,
            toolCallId: part.toolCallId,
          })
          emittedToolResultIds.add(part.toolCallId)
        }
        break

      case 'thinking':
        if (part.content) {
          // A thinking block after a tool call belongs to the next assistant
          // segment. Provider-executed tools have no separate tool-result part
          // to create this boundary for us.
          if (current.toolCalls.some(isProviderExecutedToolCall)) {
            flushSegment()
          }
          pendingThinking.push({
            content: part.content,
            ...(part.signature && { signature: part.signature }),
          })
        }
        break

      case 'structured-output':
        // Only emit completed structured responses into history. Streaming or
        // errored buffers would push malformed JSON into the next LLM turn's
        // assistant content. `raw` is the source of truth; `data` is the
        // defensive fallback for terminal-only completes that didn't ship raw.
        if (part.status === 'complete') {
          const serialized =
            part.raw !== ''
              ? part.raw
              : part.data !== undefined
                ? safeJsonStringify(part.data)
                : ''
          if (serialized !== '') {
            current.contentParts.push({ type: 'text', content: serialized })
          }
        }
        break

      case 'ui-resource':
        // MCP Apps widget — rendered client-side only. It must never enter
        // model input, so it is intentionally dropped from the model message.
        break

      default:
        break
    }
  }

  // Flush any remaining accumulated content
  flushSegment()

  // Emit tool results from client tool-call parts with output or approval,
  // but only if not already covered by an explicit tool-result part above.
  // These are appended at the end since they don't have explicit tool-result
  // parts in the parts array to trigger inline emission.
  for (const part of uiMessage.parts) {
    if (part.type !== 'tool-call') continue

    // Output takes priority — if the tool has already produced a result,
    // emit the concrete output regardless of approval metadata.
    if (part.output !== undefined && !emittedToolResultIds.has(part.id)) {
      messageList.push({
        role: 'tool',
        content: normalizeToolResult(part.output),
        toolCallId: part.id,
      })
      emittedToolResultIds.add(part.id)
    }

    // Approval response without output — emit approval status for iteration tracking
    if (
      part.output === undefined &&
      part.state === 'approval-responded' &&
      part.approval?.approved !== undefined &&
      !emittedToolResultIds.has(part.id)
    ) {
      const approved = part.approval.approved
      messageList.push({
        role: 'tool',
        content: JSON.stringify({
          approved,
          ...(approved && { pendingExecution: true }),
          message: approved
            ? 'User approved this action'
            : 'User denied this action',
        }),
        toolCallId: part.id,
      })
      emittedToolResultIds.add(part.id)
    }
  }

  // If no messages were produced (e.g., empty parts), emit a minimal assistant message
  if (messageList.length === 0) {
    messageList.push({
      role: 'assistant',
      content: null,
    })
  }

  return messageList
}

/**
 * Convert a ModelMessage to UIMessage
 *
 * This conversion creates a parts-based structure:
 * - content field → TextPart
 * - toolCalls array → ToolCallPart[]
 * - role="tool" messages should be converted separately and merged
 *
 * @param modelMessage - The ModelMessage to convert
 * @param id - Optional ID for the UIMessage (generated if not provided)
 * @returns A UIMessage with parts
 */
export function modelMessageToUIMessage(
  modelMessage: ModelMessage,
  id?: string,
): UIMessage {
  const parts: Array<MessagePart> = []

  if (modelMessage.role === 'assistant' && modelMessage.thinking?.length) {
    for (const thinking of modelMessage.thinking) {
      if (!thinking.content) continue
      parts.push({
        type: 'thinking',
        content: thinking.content,
        ...(thinking.signature && { signature: thinking.signature }),
      })
    }
  }

  // Handle tool results (when role is "tool") - only produce tool-result part,
  // not a text part (the content IS the tool result, not display text)
  if (modelMessage.role === 'tool' && modelMessage.toolCallId) {
    parts.push({
      type: 'tool-result',
      toolCallId: modelMessage.toolCallId,
      content: getTextContent(modelMessage.content),
      state: 'complete',
    })
  } else if (Array.isArray(modelMessage.content)) {
    // Multimodal content - preserve all content parts as MessageParts
    for (const part of modelMessage.content) {
      parts.push(part)
    }
  } else {
    // String or null content
    const textContent = getTextContent(modelMessage.content)
    if (textContent) {
      parts.push({
        type: 'text',
        content: textContent,
      })
    }
  }

  // Handle tool calls
  if (modelMessage.toolCalls && modelMessage.toolCalls.length > 0) {
    for (const toolCall of modelMessage.toolCalls) {
      // Model-message arguments are complete, so surface the parsed input.
      // A malformed arguments string just leaves `input` undefined.
      let input: unknown
      try {
        input = JSON.parse(toolCall.function.arguments)
      } catch {
        input = undefined
      }
      parts.push({
        type: 'tool-call',
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
        state: 'input-complete', // Model messages have complete arguments
        ...(input !== undefined && { input }),
        ...(toolCall.metadata !== undefined && { metadata: toolCall.metadata }),
      })
    }
  }

  return {
    id: id || generateMessageId(),
    role: modelMessage.role === 'tool' ? 'assistant' : modelMessage.role,
    parts,
  }
}

/**
 * Normalize a single AG-UI `MESSAGES_SNAPSHOT` message into a `UIMessage`.
 *
 * AG-UI snapshot messages use the wire shape `{ id, role, content }` and have
 * no `parts` array. Casting them directly to `UIMessage` is unsafe: any code
 * that later reads `message.parts` (e.g. the devtools `onToolCallStateChange`
 * handler) crashes with "Cannot read properties of undefined (reading 'find')".
 *
 * Each role is mapped to the canonical `UIMessage` shape, reusing
 * `modelMessageToUIMessage` for the roles that share `ModelMessage`'s structure.
 * The original AG-UI `id` is preserved so later `TEXT_MESSAGE_CONTENT` /
 * `TOOL_CALL_*` events still route by `messageId` (falling back to a generated
 * id only when the snapshot omits one). Messages that already carry `parts`
 * (e.g. a TanStack server echoing `UIMessage`s back over the wire) pass through
 * unchanged apart from ensuring an id.
 */
export function aguiSnapshotMessageToUIMessage(
  message: AGUIMessage | UIMessage,
): UIMessage {
  if ('parts' in message) {
    return { ...message, id: message.id || generateMessageId() }
  }

  const id = message.id || generateMessageId()

  switch (message.role) {
    case 'user':
      return {
        id,
        role: 'user',
        parts: aguiUserContentToParts(message.content),
      }
    case 'assistant':
      return modelMessageToUIMessage(
        {
          role: 'assistant',
          content: message.content ?? null,
          ...(message.toolCalls && { toolCalls: message.toolCalls }),
        },
        id,
      )
    case 'tool':
      return modelMessageToUIMessage(
        {
          role: 'tool',
          content: message.content,
          toolCallId: message.toolCallId,
        },
        id,
      )
    case 'system':
    case 'developer':
      // `ModelMessage` has no system/developer role; build the part directly.
      return {
        id,
        role: 'system',
        parts: message.content
          ? [{ type: 'text', content: message.content }]
          : [],
      }
    case 'reasoning':
      return {
        id,
        role: 'assistant',
        parts: message.content
          ? [{ type: 'thinking', content: message.content }]
          : [],
      }
    case 'activity':
    default:
      // `activity` (and any future role) has no text/parts equivalent today.
      return { id, role: 'assistant', parts: [] }
  }
}

/**
 * Convert AG-UI user message content into `UIMessage` parts.
 *
 * AG-UI user content is either a plain string or a multimodal array whose text
 * entries use `{ type: 'text', text }` (vs. TanStack's `{ type: 'text', content }`).
 * Text entries are rewritten to the TanStack shape; image/audio/video/document
 * entries already match `ContentPart` and pass through. `binary` entries have no
 * TanStack equivalent and are dropped.
 */
function aguiUserContentToParts(
  content: Extract<AGUIMessage, { role: 'user' }>['content'],
): Array<MessagePart> {
  if (typeof content === 'string') {
    return content ? [{ type: 'text', content }] : []
  }

  const parts: Array<MessagePart> = []
  for (const part of content) {
    if (part.type === 'text') {
      parts.push({ type: 'text', content: part.text })
    } else if (part.type !== 'binary') {
      parts.push(part)
    }
  }
  return parts
}

/**
 * Convert an array of ModelMessages to UIMessages
 *
 * This handles merging tool result messages with their corresponding assistant messages
 *
 * @param modelMessages - Array of ModelMessages to convert
 * @returns Array of UIMessages
 */
export function modelMessagesToUIMessages(
  modelMessages: Array<ModelMessage>,
): Array<UIMessage> {
  const uiMessages: Array<UIMessage> = []
  let currentAssistantMessage: UIMessage | null = null

  for (const msg of modelMessages) {
    if (msg.role === 'tool') {
      // Tool result - merge into the last assistant message if possible
      if (
        msg.toolCallId !== undefined &&
        currentAssistantMessage &&
        currentAssistantMessage.role === 'assistant'
      ) {
        const content = getTextContent(msg.content)
        const toolCallPart = currentAssistantMessage.parts.find(
          (part): part is ToolCallPart =>
            part.type === 'tool-call' && part.id === msg.toolCallId,
        )

        if (toolCallPart) {
          toolCallPart.output = parseToolResultContent(content)
          toolCallPart.state = 'complete'
        }

        currentAssistantMessage.parts.push({
          type: 'tool-result',
          toolCallId: msg.toolCallId,
          content,
          state: 'complete',
        })
      } else {
        // No assistant message to merge into, create a standalone one
        const toolResultUIMessage = modelMessageToUIMessage(msg)
        uiMessages.push(toolResultUIMessage)
      }
    } else {
      // Regular message
      const uiMessage = modelMessageToUIMessage(msg)
      uiMessages.push(uiMessage)

      // Track assistant messages for potential tool result merging
      if (msg.role === 'assistant') {
        currentAssistantMessage = uiMessage
      } else {
        currentAssistantMessage = null
      }
    }
  }

  return uiMessages
}

/**
 * Normalize a message (UIMessage or ModelMessage) to a UIMessage
 * Ensures the message has an ID and createdAt timestamp
 *
 * @param message - Either a UIMessage or ModelMessage
 * @param generateId - Function to generate a message ID if needed
 * @returns A UIMessage with guaranteed id and createdAt
 */
export function normalizeToUIMessage(
  message: UIMessage | ModelMessage,
  generateId: () => string,
): UIMessage {
  if ('parts' in message) {
    // Already a UIMessage
    return {
      ...message,
      id: message.id || generateId(),
      createdAt: message.createdAt || new Date(),
    }
  } else {
    // ModelMessage - convert to UIMessage
    return {
      ...modelMessageToUIMessage(message, generateId()),
      createdAt: new Date(),
    }
  }
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`
}
