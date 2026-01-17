import type {
  AudioMessagePart,
  ContentPart,
  DocumentMessagePart,
  ImageMessagePart,
  MessagePart,
  ModelMessage,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  UIMessage,
  VideoMessagePart,
} from '../../types'
// ===========================
// Message Converters
// ===========================

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
 * Convert ContentPart array to MessagePart array
 * Preserves all multimodal content (text, image, audio, video, document)
 */
function contentPartsToMessageParts(
  contentParts: Array<ContentPart>,
): Array<MessagePart> {
  const messageParts: Array<MessagePart> = []

  for (const part of contentParts) {
    switch (part.type) {
      case 'text':
        messageParts.push({
          type: 'text',
          content: part.content,
          ...(part.metadata !== undefined && { metadata: part.metadata }),
        } as TextPart)
        break
      case 'image':
        messageParts.push({
          type: 'image',
          source: part.source,
          ...(part.metadata !== undefined && { metadata: part.metadata }),
        } as ImageMessagePart)
        break
      case 'audio':
        messageParts.push({
          type: 'audio',
          source: part.source,
          ...(part.metadata !== undefined && { metadata: part.metadata }),
        } as AudioMessagePart)
        break
      case 'video':
        messageParts.push({
          type: 'video',
          source: part.source,
          ...(part.metadata !== undefined && { metadata: part.metadata }),
        } as VideoMessagePart)
        break
      case 'document':
        messageParts.push({
          type: 'document',
          source: part.source,
          ...(part.metadata !== undefined && { metadata: part.metadata }),
        } as DocumentMessagePart)
        break
    }
  }

  return messageParts
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
 * This conversion handles the parts-based structure:
 * - Text parts → content field (string or ContentPart[])
 * - Multimodal parts (image, audio, video, document) → ContentPart[]
 * - ToolCall parts → toolCalls array
 * - ToolResult parts → separate role="tool" messages
 *
 * @param uiMessage - The UIMessage to convert
 * @returns An array of ModelMessages (may be multiple if tool results are present)
 */
export function uiMessageToModelMessages(
  uiMessage: UIMessage,
): Array<ModelMessage> {
  const messageList: Array<ModelMessage> = []

  // Skip system messages - they're handled via systemPrompts, not ModelMessages
  if (uiMessage.role === 'system') {
    return messageList
  }

  // Separate parts by type
  // Note: thinking parts are UI-only and not included in ModelMessages
  const textParts: Array<TextPart> = []
  const imageParts: Array<ImageMessagePart> = []
  const audioParts: Array<AudioMessagePart> = []
  const videoParts: Array<VideoMessagePart> = []
  const documentParts: Array<DocumentMessagePart> = []
  const toolCallParts: Array<ToolCallPart> = []
  const toolResultParts: Array<ToolResultPart> = []

  for (const part of uiMessage.parts) {
    if (part.type === 'text') {
      textParts.push(part)
    } else if (part.type === 'image') {
      imageParts.push(part)
    } else if (part.type === 'audio') {
      audioParts.push(part)
    } else if (part.type === 'video') {
      videoParts.push(part)
    } else if (part.type === 'document') {
      documentParts.push(part)
    } else if (part.type === 'tool-call') {
      toolCallParts.push(part)
    } else if (part.type === 'tool-result') {
      toolResultParts.push(part)
    }
    // thinking parts are skipped - they're UI-only
  }

  const hasMultimodalContent =
    imageParts.length > 0 ||
    audioParts.length > 0 ||
    videoParts.length > 0 ||
    documentParts.length > 0

  // Build the content field - use ContentPart[] if multimodal, string otherwise
  let content: string | null | Array<ContentPart>
  if (hasMultimodalContent) {
    const contentParts: Array<ContentPart> = []
    for (const part of uiMessage.parts) {
      if (part.type === 'text') {
        contentParts.push({
          type: 'text',
          content: part.content,
          ...(part.metadata !== undefined && { metadata: part.metadata }),
        })
      } else if (part.type === 'image') {
        contentParts.push({
          type: 'image',
          source: part.source,
          ...(part.metadata !== undefined && { metadata: part.metadata }),
        })
      } else if (part.type === 'audio') {
        contentParts.push({
          type: 'audio',
          source: part.source,
          ...(part.metadata !== undefined && { metadata: part.metadata }),
        })
      } else if (part.type === 'video') {
        contentParts.push({
          type: 'video',
          source: part.source,
          ...(part.metadata !== undefined && { metadata: part.metadata }),
        })
      } else if (part.type === 'document') {
        contentParts.push({
          type: 'document',
          source: part.source,
          ...(part.metadata !== undefined && { metadata: part.metadata }),
        })
      }
    }
    content = contentParts.length > 0 ? contentParts : null
  } else {
    // Text-only: use simple string
    content = textParts.map((p) => p.content).join('') || null
  }

  const toolCalls =
    toolCallParts.length > 0
      ? toolCallParts
          .filter(
            (p) =>
              p.state === 'input-complete' ||
              p.state === 'approval-responded' ||
              p.output !== undefined, // Include if has output (client tool result)
          )
          .map((p) => ({
            id: p.id,
            type: 'function' as const,
            function: {
              name: p.name,
              arguments: p.arguments,
            },
          }))
      : undefined

  // Create the main message
  if (uiMessage.role !== 'assistant' || content || !toolCalls) {
    messageList.push({
      role: uiMessage.role,
      content,
      ...(toolCalls && toolCalls.length > 0 && { toolCalls }),
    })
  } else if (toolCalls.length > 0) {
    // Assistant message with only tool calls
    messageList.push({
      role: 'assistant',
      content,
      toolCalls,
    })
  }

  // Add tool result messages (only completed ones)
  for (const toolResultPart of toolResultParts) {
    if (
      toolResultPart.state === 'complete' ||
      toolResultPart.state === 'error'
    ) {
      messageList.push({
        role: 'tool',
        content: toolResultPart.content,
        toolCallId: toolResultPart.toolCallId,
      })
    }
  }

  return messageList
}

/**
 * Convert a ModelMessage to UIMessage
 *
 * This conversion creates a parts-based structure:
 * - content field → TextPart (for string) or multimodal MessageParts (for ContentPart[])
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

  // Handle content - preserve multimodal content
  if (modelMessage.content !== null) {
    if (typeof modelMessage.content === 'string') {
      if (modelMessage.content) {
        parts.push({
          type: 'text',
          content: modelMessage.content,
        })
      }
    } else if (Array.isArray(modelMessage.content)) {
      parts.push(...contentPartsToMessageParts(modelMessage.content))
    }
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
