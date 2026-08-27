import { parsePartialJSON } from './json-parser'
import type {
  ContentPart,
  StructuredOutputPart,
  ThinkingPart,
  ToolCallPart,
  ToolResultPart,
  UIMessage,
} from '../../../types'
import type { ToolCallState, ToolResultState } from './types'

export function updateTextPart(
  messages: Array<UIMessage>,
  messageId: string,
  content: string,
): Array<UIMessage> {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }

    const parts = [...msg.parts]
    const lastPart = parts.length > 0 ? parts[parts.length - 1] : null

    const isText = lastPart && lastPart.type === 'text'
    if (isText) {
      // Update the last text part (continuing same text segment)
      parts[parts.length - 1] = { type: 'text', content }
    } else {
      // Create new text part (starting new text segment after tool calls/results)
      parts.push({ type: 'text', content })
    }

    return { ...msg, parts }
  })
}

export function updateToolCallPart(
  messages: Array<UIMessage>,
  messageId: string,
  toolCall: {
    id: string
    name: string
    arguments: string
    state: ToolCallState
    /** Parsed input — set when the arguments are complete. */
    input?: unknown
    metadata?: Record<string, unknown>
  },
): Array<UIMessage> {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }

    const parts = [...msg.parts]
    const existing = parts.find(
      (p): p is ToolCallPart => p.type === 'tool-call' && p.id === toolCall.id,
    )

    const metadata = toolCall.metadata ?? existing?.metadata
    // Same for the parsed input: it's supplied once at completion, so
    // subsequent arg-less updates (approval, etc.) must not drop it.
    const input = toolCall.input ?? existing?.input

    const toolCallPart: ToolCallPart = {
      type: 'tool-call',
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      state: toolCall.state,
      // Carry forward approval, output and parsed input from the existing part
      ...(existing?.approval && { approval: { ...existing.approval } }),
      ...(existing?.output !== undefined && { output: existing.output }),
      ...(input !== undefined && { input }),
      ...(metadata !== undefined && { metadata }),
    }

    if (existing) {
      // Update existing tool call
      parts[parts.indexOf(existing)] = toolCallPart
    } else {
      // Add new tool call at the end (preserve natural streaming order)
      parts.push(toolCallPart)
    }

    return { ...msg, parts }
  })
}

export function updateToolResultPart(
  messages: Array<UIMessage>,
  messageId: string,
  toolCallId: string,
  content: string | Array<ContentPart>,
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
      const index = parts.indexOf(toolCallPart)
      parts[index] = {
        ...toolCallPart,
        state: 'approval-requested',
        approval: {
          id: approvalId,
          needsApproval: true,
        },
      }
    }

    return { ...msg, parts }
  })
}

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
      const index = parts.indexOf(toolCallPart)
      parts[index] = { ...toolCallPart, state }
    }

    return { ...msg, parts }
  })
}

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
      const index = parts.indexOf(toolCallPart)
      parts[index] = {
        ...toolCallPart,
        output: errorText ? { error: errorText } : output,
        state: state ?? (errorText ? 'error' : 'complete'),
      }
    }

    return { ...msg, parts }
  })
}

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
      const index = parts.indexOf(toolCallPart)
      parts[index] = {
        ...toolCallPart,
        approval: { ...toolCallPart.approval, approved },
        state: 'approval-responded',
      }
    }

    return { ...msg, parts }
  })
}

export function appendStructuredOutputDelta(
  messages: Array<UIMessage>,
  messageId: string,
  delta: string,
): Array<UIMessage> {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }

    const parts = [...msg.parts]
    const existingIndex = parts.findIndex(
      (p): p is StructuredOutputPart => p.type === 'structured-output',
    )
    const existing =
      existingIndex >= 0 ? (parts[existingIndex] as StructuredOutputPart) : null

    const nextRaw = (existing?.raw ?? '') + delta
    const progressive = parsePartialJSON(nextRaw)
    const nextPartial =
      progressive !== undefined && progressive !== null
        ? progressive
        : existing?.partial

    const nextPart: StructuredOutputPart = {
      type: 'structured-output',
      status: 'streaming',
      raw: nextRaw,
      ...(nextPartial !== undefined ? { partial: nextPartial } : {}),
      ...(existing?.reasoning !== undefined
        ? { reasoning: existing.reasoning }
        : {}),
    }

    if (existingIndex >= 0) {
      parts[existingIndex] = nextPart
    } else {
      parts.push(nextPart)
    }

    return { ...msg, parts }
  })
}

export function completeStructuredOutputPart(
  messages: Array<UIMessage>,
  messageId: string,
  data: unknown,
  raw: string,
  reasoning?: string,
): Array<UIMessage> {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }

    const parts = [...msg.parts]
    const existingIndex = parts.findIndex(
      (p): p is StructuredOutputPart => p.type === 'structured-output',
    )

    const existingRaw =
      existingIndex >= 0
        ? (parts[existingIndex] as StructuredOutputPart).raw
        : ''
    let resolvedRaw = raw || existingRaw
    const hasResolvedRaw = resolvedRaw === '' && data !== undefined
    if (hasResolvedRaw) {
      try {
        resolvedRaw = JSON.stringify(data)
      } catch {}
    }

    const nextPart: StructuredOutputPart = {
      type: 'structured-output',
      status: 'complete',
      data,
      partial: data,
      raw: resolvedRaw,
      ...(reasoning !== undefined ? { reasoning } : {}),
    }

    if (existingIndex >= 0) {
      parts[existingIndex] = nextPart
    } else {
      parts.push(nextPart)
    }

    return { ...msg, parts }
  })
}

export function errorStructuredOutputPart(
  messages: Array<UIMessage>,
  messageId: string,
  errorMessage: string,
): Array<UIMessage> {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }

    const parts = [...msg.parts]
    const existingIndex = parts.findIndex(
      (p): p is StructuredOutputPart => p.type === 'structured-output',
    )

    if (existingIndex < 0) {
      parts.push({
        type: 'structured-output',
        status: 'error',
        raw: '',
        errorMessage,
      })
      return { ...msg, parts }
    }

    const existing = parts[existingIndex] as StructuredOutputPart
    if (existing.status === 'complete') {
      return msg
    }
    parts[existingIndex] = {
      ...existing,
      status: 'error',
      errorMessage,
    }
    return { ...msg, parts }
  })
}

export function updateThinkingPart(
  messages: Array<UIMessage>,
  messageId: string,
  stepId: string,
  content: string,
  signature?: string,
): Array<UIMessage> {
  return messages.map((msg) => {
    if (msg.id !== messageId) {
      return msg
    }

    const parts = [...msg.parts]
    const thinkingPartIndex = parts.findIndex(
      (p) => p.type === 'thinking' && p.stepId === stepId,
    )

    const thinkingPart: ThinkingPart = {
      type: 'thinking',
      content,
      stepId,
      ...(signature && { signature }),
    }

    if (thinkingPartIndex >= 0) {
      // Update existing thinking part for this step
      parts[thinkingPartIndex] = thinkingPart
    } else {
      // Add new thinking part at the end (preserve natural streaming order)
      parts.push(thinkingPart)
    }

    return { ...msg, parts }
  })
}
