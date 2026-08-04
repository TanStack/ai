/**
 * Turn a harness's PASSTHROUGH tool-call chunks into transcript messages, so a
 * finished run's tool cards survive a reload.
 *
 * Why this is needed at all: a harness executes its tools INSIDE the sandbox, so
 * `chat()` only relays its `TOOL_CALL_*` chunks — it never writes an assistant
 * message for them (`addAssistantToolCallMessage` is gated on the engine having
 * executed the tool itself). Chat persistence stores `ctx.messages`, so the whole
 * tool history existed only in the delivery log. Replaying that log is what makes
 * "switch away and come back" show everything; a FINISHED thread has no run to
 * rejoin, hydrates from the message store instead, and so came back as nothing but
 * the prompt and the final answer.
 *
 * Recording the calls as ordinary `toolCalls` + `role: 'tool'` messages needs no new
 * wire format and no client change: `modelMessagesToUIMessages` already merges a tool
 * result into the call it belongs to and marks the part complete, and
 * `reconstructChat` already runs that converter.
 */
import { EventType } from '@tanstack/ai'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'

/**
 * Metadata key set on every tool call recorded here.
 *
 * INTERNAL, and deliberately not exported: an app asks {@link isSandboxToolCall}
 * instead of knowing the key. Renaming it is a storage-visible change, because it ends
 * up inside stored `toolCalls[].metadata`, so the recorder test pins the literal.
 */
const SANDBOX_OBSERVED = 'sandboxObserved'

/**
 * What the recorder writes into. `ChatMiddlewareContext.messages` is a
 * `ReadonlyArray`, so the transcript grows by REPLACING the array — the same way the
 * engine itself syncs `middlewareCtx.messages`.
 */
interface TranscriptTarget {
  messages: ReadonlyArray<ModelMessage>
}

interface OpenCall {
  name: string
  /** Accumulated `TOOL_CALL_ARGS` deltas; superseded by `input` when the adapter sends it. */
  args: string
}

export interface ToolHistoryRecorder {
  /** Feed every chunk. Observes only — never transforms or drops. */
  observe: (chunk: StreamChunk, target: TranscriptTarget) => void
  /**
   * Re-append anything missing from the transcript.
   *
   * The engine reassigns `middlewareCtx.messages` from its own array whenever it
   * syncs config (once per agent iteration), which discards writes made during the
   * previous iteration's stream. Reconciling at each iteration boundary and again at
   * finish makes the result independent of that, and independent of where this
   * middleware sits relative to persistence in the middleware array.
   */
  reconcile: (target: TranscriptTarget) => void
}

/**
 * True when this tool call was executed by the HARNESS inside the sandbox, and
 * recorded into the transcript for display, rather than executed by the agent loop.
 *
 * Use it to decide what your own `MessageStore` keeps — these calls are display
 * history, so dropping or capping them is safe (they are already stripped from the
 * request to the model on the next turn). Also works on a `tool-call` UI part, whose
 * `metadata` is copied straight from the model message.
 *
 * `metadata` is `unknown` on both, so the key can only be read behind a typeof/`in`
 * check; this mirrors the core `isProviderExecutedToolCall` convention.
 *
 * ```ts
 * import { isSandboxToolCall } from '@tanstack/ai-sandbox'
 *
 * const kept = messages.filter(
 *   (message) => !message.toolCalls?.every(isSandboxToolCall),
 * )
 * ```
 */
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
    // An id already present is either the engine's own (it executed the tool itself)
    // or a chunk seen before — a journal replay on takeover re-emits the whole
    // stream. Either way a second write would duplicate the card.
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
    // An if/else chain rather than a `switch`: only four of the ~20 chunk types are
    // interesting here, and a `switch` on `chunk.type` has to enumerate all of them
    // to satisfy the exhaustiveness lint.
    observe(chunk, target) {
      if (chunk.type === EventType.TOOL_CALL_START) {
        // `toolCallName` is the AG-UI field; `toolName` is its deprecated alias, and
        // that alias is what several harness adapters still emit.
        const name = chunk.toolCallName ?? chunk.toolName
        if (!name) return
        open.set(chunk.toolCallId, { name, args: '' })
        return
      }
      if (chunk.type === EventType.TOOL_CALL_ARGS) {
        const call = open.get(chunk.toolCallId)
        if (!call) return
        // `args` is the accumulated-so-far field. Prefer it over stitching deltas:
        // an adapter that sends both would otherwise double the arguments.
        call.args = chunk.args ?? call.args + chunk.delta
        return
      }
      if (chunk.type === EventType.TOOL_CALL_END) {
        const call = open.get(chunk.toolCallId)
        if (!call) return
        open.delete(chunk.toolCallId)
        // `input` is the final PARSED input, so it beats the streamed string, which
        // can be a truncated fragment if the arguments stream was cut short.
        const args =
          chunk.input !== undefined ? JSON.stringify(chunk.input) : call.args
        recorded.push({ id: chunk.toolCallId, name: call.name, args })
        appendCall(target, chunk.toolCallId, call.name, args)
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

/**
 * Drop recorded harness tool calls from a list of messages bound for the model.
 *
 * A stored transcript becomes the history for the NEXT turn. These calls name tools
 * the provider was never given, and one triage-sized run is hundreds of kilobytes of
 * tool output — so replaying them is wasteful at best and rejected at worst. They stay
 * in `ctx.messages` (which is what gets stored and rendered); only the request to the
 * model loses them.
 *
 * An assistant message is dropped only when EVERY call on it is observed, so a mixed
 * message — one engine tool call plus one harness tool call — is left alone rather than
 * silently losing the engine's half.
 */
export function stripObservedToolCalls(
  messages: ReadonlyArray<ModelMessage>,
): Array<ModelMessage> {
  const dropped = new Set<string>()
  const kept: Array<ModelMessage> = []
  for (const message of messages) {
    const calls = message.toolCalls
    if (calls && calls.length > 0 && calls.every(isSandboxToolCall)) {
      for (const call of calls) dropped.add(call.id)
      continue
    }
    // Orphaning a result is worse than keeping it: a provider rejects a tool result
    // whose call is not in the history.
    if (
      message.role === 'tool' &&
      message.toolCallId !== undefined &&
      dropped.has(message.toolCallId)
    ) {
      continue
    }
    kept.push(message)
  }
  return kept
}
