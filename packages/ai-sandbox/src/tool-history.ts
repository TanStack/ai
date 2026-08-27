import { EventType } from '@tanstack/ai'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'

const SANDBOX_OBSERVED = 'sandboxObserved'

interface TranscriptTarget {
  messages: ReadonlyArray<ModelMessage>
}

interface OpenCall {
  name: string
  /** Accumulated `TOOL_CALL_ARGS` deltas. */
  args: string
}

export interface ToolHistoryRecorder {
  /** Feed every chunk. Observes only — never transforms or drops. */
  observe: (chunk: StreamChunk, target: TranscriptTarget) => void
  reconcile: (target: TranscriptTarget) => void
}

export function isSandboxToolCall(
  toolCall: { metadata?: unknown } | null | undefined,
): boolean {
  const metadata = toolCall?.metadata
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    SANDBOX_OBSERVED in metadata &&
    metadata[SANDBOX_OBSERVED] === true
  )
}

/** Does the transcript already carry this tool call, from any source? */
function hasCall(messages: ReadonlyArray<ModelMessage>, id: string): boolean {
  return messages.some((message) =>
    message.toolCalls?.some((call) => call.id === id),
  )
}

/** Does the transcript already carry this tool result? */
function hasResult(messages: ReadonlyArray<ModelMessage>, id: string): boolean {
  return messages.some(
    (message) => message.role === 'tool' && message.toolCallId === id,
  )
}

function callMessage(id: string, name: string, args: string): ModelMessage {
  return {
    role: 'assistant',
    content: null,
    toolCalls: [
      {
        id,
        type: 'function',
        function: { name, arguments: args },
        metadata: { [SANDBOX_OBSERVED]: true },
      },
    ],
  }
}

function resultMessage(id: string, content: string): ModelMessage {
  return { role: 'tool', toolCallId: id, content }
}

export function createToolHistoryRecorder(): ToolHistoryRecorder {
  const open = new Map<string, OpenCall>()
  /** Completed calls in the order they ran — the order `reconcile` restores. */
  const recorded: Array<{ id: string; name: string; args: string }> = []
  const results = new Map<string, string>()

  function appendCall(
    target: TranscriptTarget,
    id: string,
    name: string,
    args: string,
  ): void {
    if (hasCall(target.messages, id)) return
    target.messages = [...target.messages, callMessage(id, name, args)]
  }

  function appendResult(
    target: TranscriptTarget,
    id: string,
    content: string,
  ): void {
    if (hasResult(target.messages, id)) return
    target.messages = [...target.messages, resultMessage(id, content)]
  }

  const recorder: ToolHistoryRecorder = {
    observe(chunk, target) {
      if (chunk.type === EventType.TOOL_CALL_START) {
        const name = chunk.toolCallName
        if (!name) return
        open.set(chunk.toolCallId, { name, args: '' })
        return
      }
      if (chunk.type === EventType.TOOL_CALL_ARGS) {
        const call = open.get(chunk.toolCallId)
        if (!call) return
        call.args += chunk.delta
        return
      }
      if (chunk.type === EventType.TOOL_CALL_END) {
        const call = open.get(chunk.toolCallId)
        if (!call) return
        open.delete(chunk.toolCallId)
        recorded.push({
          id: chunk.toolCallId,
          name: call.name,
          args: call.args,
        })
        appendCall(target, chunk.toolCallId, call.name, call.args)
        return
      }
      if (chunk.type === EventType.TOOL_CALL_RESULT) {
        // AG-UI types `content` as a string; anything else is not a result we can
        // store as a `role: 'tool'` message.
        if (typeof chunk.content !== 'string') return
        results.set(chunk.toolCallId, chunk.content)
        appendResult(target, chunk.toolCallId, chunk.content)
      }
    },

    reconcile(target) {
      for (const { id, name, args } of recorded) {
        appendCall(target, id, name, args)
        const result = results.get(id)
        // The result goes straight after its own call, so a restored transcript reads
        // in the order the tools actually ran.
        if (result !== undefined) appendResult(target, id, result)
      }
    },
  }
  return recorder
}

export function stripObservedToolCalls(
  messages: ReadonlyArray<ModelMessage>,
): Array<ModelMessage> {
  const dropped = new Set<string>()
  const kept: Array<ModelMessage> = []
  for (const message of messages) {
    const calls = message.toolCalls
    const hasSandboxToolCalls =
      calls && calls.length > 0 && calls.every(isSandboxToolCall)
    if (hasSandboxToolCalls) {
      for (const call of calls) dropped.add(call.id)
      continue
    }
    // Orphaning a result is worse than keeping it: a provider rejects a tool result
    // whose call is not in the history.
    const isDroppedToolResult =
      message.role === 'tool' &&
      message.toolCallId !== undefined &&
      dropped.has(message.toolCallId)
    if (isDroppedToolResult) {
      continue
    }
    kept.push(message)
  }
  return kept
}
