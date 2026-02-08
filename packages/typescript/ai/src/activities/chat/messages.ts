import type {
  AudioPart,
  ContentPart,
  DocumentPart,
  ImagePart,
  MessagePart,
  ModelMessage,
  TextPart,
  ToolCallPart,
  UIMessage,
  VideoPart,
} from '../../types'
// ===========================
// Message Converters
// ===========================

/**
 * Helper to check if a part is a multimodal content part (image, audio, video, document)
 */
function isMultimodalPart(
  part: MessagePart,
): part is ImagePart | AudioPart | VideoPart | DocumentPart {
  return (
    part.type === 'image' ||
    part.type === 'audio' ||
    part.type === 'video' ||
    part.type === 'document'
  )
}

/**
 * Helper to extract text content from string or ContentPart array
 * For multimodal content, this extracts only the text parts
 */
function getTextContent(content: string | null | Array<ContentPart>): string {
  if (content === null) {
    return ''
  }
  if (typeof content === 'string') {
    return content
  }
  // Extract text from ContentPart array
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.content)
    .join('')
}

/**
 * Convert UIMessages or ModelMessages to ModelMessages
 */
export function convertMessagesToModelMessages(
  messages: Array<UIMessage | ModelMessage>,
): Array<ModelMessage> {
  const modelMessages: Array<ModelMessage> = []
  for (const msg of messages) {
    if ('parts' in msg) {
      // UIMessage - convert to ModelMessages
      modelMessages.push(...uiMessageToModelMessages(msg))
    } else {
      // Already ModelMessage
      modelMessages.push(msg)
    }
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
  const hasMultimodal = uiMessage.parts.some((p) => isMultimodalPart(p))

  let content: string | null | Array<ContentPart>
  if (hasMultimodal) {
    // Build ContentPart array preserving order of text and multimodal parts
    const contentParts: Array<ContentPart> = []
    for (const part of uiMessage.parts) {
      if (part.type === 'text') {
        contentParts.push(part)
      } else if (isMultimodalPart(part)) {
        contentParts.push(part)
      }
    }
    content = contentParts
  } else {
    // Simple string content for text-only messages
    const texts = uiMessage.parts
      .filter((p): p is TextPart => p.type === 'text')
      .map((p) => p.content)
    content = texts.join('') || null
  }

  return {
    role: uiMessage.role as 'user' | 'assistant' | 'tool',
    content,
  }
}

// Accumulator for building an assistant segment (text + tool calls)
interface AssistantSegment {
  textParts: Array<string>
  multimodalParts: Array<ContentPart>
  toolCalls: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  hasContent: boolean
}

function createSegment(): AssistantSegment {
  return { textParts: [], multimodalParts: [], toolCalls: [], hasContent: false }
}

function segmentToContent(
  seg: AssistantSegment,
): string | null | Array<ContentPart> {
  if (seg.multimodalParts.length > 0) {
    // Interleave text and multimodal in the order they were added
    // (they're accumulated from the sequential walk, so already ordered)
    const parts: Array<ContentPart> = []
    // We stored them separately, but they were accumulated in walk order.
    // For simplicity, emit all text first then multimodal. In practice,
    // multimodal parts in assistant messages are rare.
    for (const text of seg.textParts) {
      parts.push({ type: 'text', content: text } as ContentPart)
    }
    parts.push(...seg.multimodalParts)
    return parts
  }
  const joined = seg.textParts.join('')
  return joined || null
}

function isToolCallIncluded(part: ToolCallPart): boolean {
  return (
    part.state === 'input-complete' ||
    part.state === 'approval-responded' ||
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

  // Track emitted tool result IDs to avoid duplicates.
  // A tool call can have BOTH an explicit tool-result part AND an output
  // field on the tool-call part. We only want one per tool call ID.
  const emittedToolResultIds = new Set<string>()

  function flushSegment(): void {
    const content = segmentToContent(current)
    const hasContent = Array.isArray(content) ? true : content !== null
    const hasToolCalls = current.toolCalls.length > 0

    if (hasContent || hasToolCalls) {
      messageList.push({
        role: 'assistant',
        content,
        ...(hasToolCalls && { toolCalls: current.toolCalls }),
      })
    }
    current = createSegment()
  }

  for (const part of uiMessage.parts) {
    switch (part.type) {
      case 'text':
        current.textParts.push(part.content)
        current.hasContent = true
        break

      case 'image':
      case 'audio':
      case 'video':
      case 'document':
        current.multimodalParts.push(part)
        current.hasContent = true
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
          })
          current.hasContent = true
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

      // thinking parts are skipped - they're UI-only
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

    // Client tool with output - add as tool result (if not already emitted)
    if (
      part.output !== undefined &&
      !part.approval &&
      !emittedToolResultIds.has(part.id)
    ) {
      messageList.push({
        role: 'tool',
        content: JSON.stringify(part.output),
        toolCallId: part.id,
      })
      emittedToolResultIds.add(part.id)
    }

    // Approval response - add as tool result for iteration tracking
    if (
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

  // Handle content (convert multimodal content to text for UI)
  const textContent = getTextContent(modelMessage.content)
  if (textContent) {
    parts.push({
      type: 'text',
      content: textContent,
    })
  }

  // Handle tool calls
  if (modelMessage.toolCalls && modelMessage.toolCalls.length > 0) {
    for (const toolCall of modelMessage.toolCalls) {
      parts.push({
        type: 'tool-call',
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
        state: 'input-complete', // Model messages have complete arguments
      })
    }
  }

  // Handle tool results (when role is "tool")
  if (modelMessage.role === 'tool' && modelMessage.toolCallId) {
    parts.push({
      type: 'tool-result',
      toolCallId: modelMessage.toolCallId,
      content: getTextContent(modelMessage.content),
      state: 'complete',
    })
  }

  return {
    id: id || generateMessageId(),
    role: modelMessage.role === 'tool' ? 'assistant' : modelMessage.role,
    parts,
  }
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
        currentAssistantMessage &&
        currentAssistantMessage.role === 'assistant'
      ) {
        currentAssistantMessage.parts.push({
          type: 'tool-result',
          toolCallId: msg.toolCallId!,
          content: getTextContent(msg.content),
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
