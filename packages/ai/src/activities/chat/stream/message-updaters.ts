/**
 * Message Updaters (Internal)
 *
 * Internal helper functions for updating UIMessage parts.
 * These are used by StreamProcessor to manage the message array.
 */

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

/**
 * Update or add a text part to a message.
 *
 * If the last part is a text part, update it (continuing the same text segment).
 * Otherwise, create a new text part (starting a new text segment after tool calls).
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

    const parts = [...msg.parts]
    const lastPart = parts.length > 0 ? parts[parts.length - 1] : null

    if (lastPart && lastPart.type === 'text') {
      // Update the last text part (continuing same text segment)
      parts[parts.length - 1] = { type: 'text', content }
    } else {
      // Create new text part (starting new text segment after tool calls/results)
      parts.push({ type: 'text', content })
    }

    return { ...msg, parts }
  })
}

/**
 * Update or add a tool call part to a message.
 */
export function updateToolCallPart(
  messages: Array<UIMessage>,
  messageId: string,
  toolCall: {
    id: string
    name: string
    arguments: string
    state: ToolCallState
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

    // Carry forward metadata from either the new toolCall or the existing
    // part. Once the adapter has emitted metadata for a tool call (e.g.
    // Gemini's thoughtSignature on TOOL_CALL_START) we must not lose it on
    // subsequent updates that don't re-supply it.
    const metadata = toolCall.metadata ?? existing?.metadata

    const toolCallPart: ToolCallPart = {
      type: 'tool-call',
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      state: toolCall.state,
      // Carry forward approval and output from the existing part
      ...(existing?.approval && { approval: { ...existing.approval } }),
      ...(existing?.output !== undefined && { output: existing.output }),
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

/**
 * Update or add a tool result part to a message.
 */
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
      const index = parts.indexOf(toolCallPart)
      parts[index] = { ...toolCallPart, state }
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
      const index = parts.indexOf(toolCallPart)
      parts[index] = {
        ...toolCallPart,
        output: errorText ? { error: errorText } : output,
        state: state ?? (errorText ? 'input-complete' : 'complete'),
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

/**
 * Append a delta to the structured-output part on `messageId`, or create one
 * if absent. Progressive parse of the accumulated buffer fills `partial`.
 *
 * Callers must only invoke this while the part is still in flight — the
 * helper unconditionally writes `status: 'streaming'`, so feeding it a delta
 * after a `complete`/`error` terminal would regress the part. In practice the
 * processor gates calls via `structuredMessageIds`, which is dropped on
 * terminal events.
 *
 * If the progressive parse returns null/undefined (the buffer is not yet a
 * parseable JSON prefix), the previously-good `partial` is preserved so the
 * UI doesn't flicker back to empty for a single render.
 */
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

/**
 * Snap the structured-output part on `messageId` to `complete` with the
 * validated `data`. Picks the freshest available `raw` so the wire
 * round-trip stays internally consistent:
 *
 *   1. Caller-supplied `raw` (the original streamed bytes from the model).
 *   2. The existing part's `raw` (deltas accumulated before this terminal).
 *   3. `JSON.stringify(data)` as a defensive fallback for terminal-only
 *      completes that never shipped raw — keeps the part self-consistent
 *      so downstream consumers never see a complete part with empty raw.
 */
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
    if (resolvedRaw === '' && data !== undefined) {
      try {
        resolvedRaw = JSON.stringify(data)
      } catch {
        // Unserializable (circular, BigInt, throwing toJSON). Leave raw
        // empty. Both downstream paths handle this: `ag-ui-wire.ts`
        // `collectText` skips complete parts with empty raw entirely, and
        // `uiMessageToModelMessages` falls back to a defensive
        // `safeJsonStringify(data)` which itself returns `''` for the same
        // unserializable inputs — so the turn is silently dropped from the
        // next request rather than shipping garbage or crashing the stream.
      }
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

/**
 * Mark the structured-output part on `messageId` as errored. If no part
 * exists yet — RUN_ERROR fired after `structured-output.start` but before
 * any delta — create an empty errored placeholder so consumers have
 * something renderable. Existing complete parts are left alone (an error
 * after a successful complete should not retroactively un-complete it).
 */
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

/**
 * Update or add a thinking part to a message, keyed by stepId.
 * Each distinct stepId produces its own ThinkingPart.
 */
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
