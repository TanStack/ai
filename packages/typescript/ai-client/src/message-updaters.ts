import type {
  ThinkingPart,
  ToolCallPart,
  ToolCallState,
  ToolResultPart,
  ToolResultState,
  UIMessage,
} from './types'

/**
 * Update or add a text part to a message, ensuring tool calls come before text.
 * Text parts are always placed at the end (after tool calls).
 */
export function updateTextPart(
  messages: Array<UIMessage>,
  messageId: string,
  content: string,
): Array<UIMessage> {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }

    let parts = [...msg.parts]
    const textPartIndex = parts.findIndex((p) => p.type === 'text')

    // Always add/update text part at the end (after tool calls)
    if (textPartIndex >= 0) {
      parts[textPartIndex] = { type: 'text', content }
    } else {
      // Remove existing parts temporarily to ensure order
      const toolCallParts = parts.filter((p) => p.type === 'tool-call')
      const otherParts = parts.filter(
        (p) => p.type !== 'tool-call' && p.type !== 'text',
      )

      // Rebuild: tool calls first, then other parts, then text
      parts = [...toolCallParts, ...otherParts, { type: 'text', content }]
    }

    return { ...msg, parts }
  })
}

/**
 * Update or add a tool call part to a message.
 * Tool calls are inserted before any text parts.
 */
export function updateToolCallPart(
  messages: Array<UIMessage>,
  messageId: string,
  toolCall: {
    id: string
    name: string
    arguments: string
    state: ToolCallState
  },
): Array<UIMessage> {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }

    const parts = [...msg.parts]
    // Find by ID, not index!
    const existingPartIndex = parts.findIndex(
      (p): p is ToolCallPart => p.type === 'tool-call' && p.id === toolCall.id,
    )

    const toolCallPart: ToolCallPart = {
      type: 'tool-call',
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      state: toolCall.state,
    }

    if (existingPartIndex >= 0) {
      // Update existing tool call
      parts[existingPartIndex] = toolCallPart
    } else {
      // Insert tool call before any text parts
      const textPartIndex = parts.findIndex((p) => p.type === 'text')
      if (textPartIndex >= 0) {
        parts.splice(textPartIndex, 0, toolCallPart)
      } else {
        parts.push(toolCallPart)
      }
    }

    return { ...msg, parts }
  })
}

/**
 * Update or add a tool result part to a message.
 */
export function updateToolResultPart(
  messages: Array<UIMessage>,
  messageId: string,
  toolCallId: string,
  content: string,
  state: ToolResultState,
  error?: string,
): Array<UIMessage> {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }

    const parts = [...msg.parts]
    const resultPartIndex = parts.findIndex(
      (p): p is ToolResultPart =>
        p.type === 'tool-result' && p.toolCallId === toolCallId,
    )

    const toolResultPart: ToolResultPart = {
      type: 'tool-result',
      toolCallId,
      content,
      state,
      ...(error && { error }),
    }

    if (resultPartIndex >= 0) {
      parts[resultPartIndex] = toolResultPart
    } else {
      parts.push(toolResultPart)
    }

    return { ...msg, parts }
  })
}

/**
 * Update a tool call part with approval request metadata.
 */
export function updateToolCallApproval(
  messages: Array<UIMessage>,
  messageId: string,
  toolCallId: string,
  approvalId: string,
): Array<UIMessage> {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }

    const parts = [...msg.parts]
    const toolCallPart = parts.find(
      (p): p is ToolCallPart => p.type === 'tool-call' && p.id === toolCallId,
    )

    if (toolCallPart) {
      toolCallPart.state = 'approval-requested'
      toolCallPart.approval = {
        id: approvalId,
        needsApproval: true,
      }
    }

    return { ...msg, parts }
  })
}

/**
 * Update a tool call part's state (e.g., to "input-complete").
 */
export function updateToolCallState(
  messages: Array<UIMessage>,
  messageId: string,
  toolCallId: string,
  state: ToolCallState,
): Array<UIMessage> {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }

    const parts = [...msg.parts]
    const toolCallPart = parts.find(
      (p): p is ToolCallPart => p.type === 'tool-call' && p.id === toolCallId,
    )

    if (toolCallPart) {
      toolCallPart.state = state
    }

    return { ...msg, parts }
  })
}

/**
 * Update a tool call part with output.
 * Searches all messages to find the tool call by ID.
 */
export function updateToolCallWithOutput(
  messages: Array<UIMessage>,
  toolCallId: string,
  output: any,
  state?: ToolCallState,
  errorText?: string,
): Array<UIMessage> {
  return messages.map((msg) => {
    const parts = [...msg.parts]
    const toolCallPart = parts.find(
      (p): p is ToolCallPart => p.type === 'tool-call' && p.id === toolCallId,
    )

    if (toolCallPart) {
      toolCallPart.output = errorText ? { error: errorText } : output
      if (state) {
        toolCallPart.state = state
      } else {
        toolCallPart.state = 'input-complete'
      }
    }

    return { ...msg, parts }
  })
}

/**
 * Update a tool call part with approval response.
 * Searches all messages to find the tool call by approval ID.
 */
export function updateToolCallApprovalResponse(
  messages: Array<UIMessage>,
  approvalId: string,
  approved: boolean,
): Array<UIMessage> {
  return messages.map((msg) => {
    const parts = [...msg.parts]
    const toolCallPart = parts.find(
      (p): p is ToolCallPart =>
        p.type === 'tool-call' && p.approval?.id === approvalId,
    )

    if (toolCallPart && toolCallPart.approval) {
      toolCallPart.approval.approved = approved
      toolCallPart.state = 'approval-responded'
    }

    return { ...msg, parts }
  })
}

/**
 * Update or add a thinking part to a message.
 * Thinking parts are typically placed before text parts.
 */
export function updateThinkingPart(
  messages: Array<UIMessage>,
  messageId: string,
  content: string,
): Array<UIMessage> {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }

    const parts = [...msg.parts]
    const thinkingPartIndex = parts.findIndex((p) => p.type === 'thinking')

    const thinkingPart: ThinkingPart = {
      type: 'thinking',
      content,
    }

    if (thinkingPartIndex >= 0) {
      // Update existing thinking part
      parts[thinkingPartIndex] = thinkingPart
    } else {
      // Insert thinking part before text parts (but after tool calls)
      const textPartIndex = parts.findIndex((p) => p.type === 'text')
      if (textPartIndex >= 0) {
        parts.splice(textPartIndex, 0, thinkingPart)
      } else {
        // No text part, add at end
        parts.push(thinkingPart)
      }
    }

    return { ...msg, parts }
  })
}
