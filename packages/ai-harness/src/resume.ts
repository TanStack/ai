import { isProviderExecutedToolCall, normalizeToolResult } from '@tanstack/ai'
import { isRecord } from './utils'
import type {
  AfterToolCallInfo,
  AnyChatMiddleware,
  ModelMessage,
  RunStore,
} from '@tanstack/ai'
import type { MessageStore } from '@tanstack/ai-persistence'
import type { Redactor } from './auth'
import type { HarnessDurability } from './define'
import type { RecoverContext } from './turn'

/** The tool result a crash leaves for a tool that must not run twice. */
export const INTERRUPTED_TOOL_RESULT = {
  interrupted: true,
  note: 'The tool may or may not have run. Check before you retry.',
}

/** The tool result of a call in an answer that stopped at the output limit. */
export const TRUNCATED_TOOL_RESULT =
  'The answer was cut off at the output limit before this tool call was complete. The call did not run.'

/** The user message after an answer that a crash cut. */
export const CUT_OFF_NOTE =
  'The previous answer was cut off. Continue exactly where it stopped, without repeating it.'

export type PendingTool = {
  toolCallId: string
  name: string
  replay: 'safe' | 'never'
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * chat() reports a call cut at the output limit with the error code
 * `max_tokens` and no run time. A tool that ran and failed has a duration.
 */
const isCutCall = (info: AfterToolCallInfo) =>
  info.duration === 0 &&
  isRecord(info.error) &&
  info.error.code === 'max_tokens'

/** The text of a call cut at the output limit. */
function truncatedText(
  truncated: HarnessDurability['truncatedToolResult'],
  call: { toolCallId: string; toolName: string },
): string {
  return typeof truncated === 'function'
    ? truncated(call)
    : (truncated ?? TRUNCATED_TOOL_RESULT)
}

/**
 * Chat middleware that gives each call cut at the output limit the
 * `truncatedToolResult` text, so the live tool message and the one recovery
 * writes are the same.
 */
export function truncationMiddleware(
  truncated: HarnessDurability['truncatedToolResult'],
): AnyChatMiddleware {
  return {
    name: 'harness:truncation',
    onAfterToolCall: (_ctx, info) =>
      isCutCall(info)
        ? { type: 'replaceResult', result: truncatedText(truncated, info) }
        : undefined,
  }
}

/**
 * Chat middleware that makes a turn resumable after a crash:
 *
 * - saves the transcript before and after each tool phase;
 * - records each tool call that started but has no result yet.
 *
 * It does not record the results: a later `onAfterToolCall` can still
 * replace them. {@link toolResultRecorder}, at the end of the list, does.
 */
export function checkpointMiddleware(options: {
  runs?: RunStore
  messages: MessageStore
  /** Called before each tool call runs, after its checkpoint is saved. */
  onToolStart?: (info: {
    toolCallId: string
    name: string
    replay: 'safe' | 'never'
  }) => void | Promise<void>
}): AnyChatMiddleware {
  const { runs, messages } = options
  const state = new WeakMap<object, { pending: Array<PendingTool> }>()

  const saveCheckpoint = async (runId: string, pending: Array<PendingTool>) => {
    await runs?.update(runId, {
      checkpoint: { at: Date.now(), pendingTools: [...pending] },
    })
  }
  const stop = (ctx: object) => {
    state.delete(ctx)
  }

  return {
    name: 'harness:checkpoint',
    onStart(ctx) {
      state.set(ctx, { pending: [] })
    },
    async onBeforeToolCall(ctx, hook) {
      const entry = state.get(ctx)
      if (!entry) return
      // The first call of a phase: the transcript now holds the assistant
      // message with the tool calls. Save it, so resume can find them.
      if (entry.pending.length === 0) {
        await messages.saveThread(ctx.threadId, [...ctx.messages])
      }
      entry.pending.push({
        toolCallId: hook.toolCallId,
        name: hook.toolName,
        replay: hook.tool?.replay ?? 'never',
      })
      await saveCheckpoint(ctx.runId, entry.pending)
      await options.onToolStart?.({
        toolCallId: hook.toolCallId,
        name: hook.toolName,
        replay: hook.tool?.replay ?? 'never',
      })
    },
    onAfterToolCall(ctx, info) {
      const entry = state.get(ctx)
      if (!entry) return
      entry.pending = entry.pending.filter(
        (tool) => tool.toolCallId !== info.toolCallId,
      )
    },
    async onToolPhaseComplete(ctx) {
      const entry = state.get(ctx)
      if (!entry) return
      await messages.saveThread(ctx.threadId, [...ctx.messages])
      entry.pending = []
      await saveCheckpoint(ctx.runId, [])
    },
    onFinish: (ctx) => stop(ctx),
    onAbort: (ctx) => stop(ctx),
    onError: (ctx) => stop(ctx),
  }
}

/** The error text the engine gives a tool message with an error result. */
function toolErrorText(content: ModelMessage['content']): string {
  const wire = typeof content === 'string' ? content : JSON.stringify(content)
  let output: unknown = wire
  try {
    output = JSON.parse(wire)
  } catch {
    // Plain text stays a string.
  }
  if (isRecord(output) && typeof output.error === 'string') return output.error
  return typeof output === 'string' ? output : 'Tool execution failed'
}

/**
 * Chat middleware that scrubs the secrets of `redactor` from each tool
 * result, so the model, the stream, and the log get the same scrubbed
 * value. An error stays an error. Put it right before
 * {@link toolResultRecorder}.
 */
export function scrubToolResults(redactor: Redactor): AnyChatMiddleware {
  return {
    name: 'harness:scrub-tool-results',
    onAfterToolCall(_ctx, info) {
      if (redactor.isEmpty) return undefined
      if (info.ok || info.result !== undefined) {
        const result = redactor.redact(info.result)
        return result === info.result
          ? undefined
          : { type: 'replaceResult', result }
      }
      // An error with no replacement: the engine gives the model its text.
      const text = errorText(info.error)
      const scrubbed = redactor.scrub(text)
      return scrubbed === text
        ? undefined
        : { type: 'replaceResult', result: { error: scrubbed } }
    },
  }
}

/**
 * Chat middleware that gives `onToolResult` the tool message of each call
 * that ends: the final result, after every other `onAfterToolCall` hook.
 * Put it at the very end of the middleware list. Recovery after a crash
 * puts this message back, so the model gets the result it saw before.
 */
export function toolResultRecorder(
  onToolResult: (info: {
    toolCallId: string
    message: ModelMessage
  }) => void | Promise<void>,
): AnyChatMiddleware {
  return {
    name: 'harness:tool-result-recorder',
    async onAfterToolCall(_ctx, info) {
      // A call cut at the output limit never ran: `truncationMiddleware`
      // owns its text, and recovery writes the same one.
      if (isCutCall(info)) return
      // A replacement made on an error wins over the error text.
      const result = info.ok
        ? info.result
        : (info.result ?? { error: errorText(info.error) })
      // The same content the engine puts in its tool message.
      const content = normalizeToolResult(result)
      const message: ModelMessage = info.ok
        ? { role: 'tool', toolCallId: info.toolCallId, content }
        : {
            role: 'tool',
            toolCallId: info.toolCallId,
            content,
            error: toolErrorText(content),
          }
      await onToolResult({ toolCallId: info.toolCallId, message })
    },
  }
}

/** A tool call that a repair closes with an error result, and why. */
export type ClosedToolCall = RecoverContext['interruptedTools'][number]

/**
 * What a repair of `history` adds for each tool call of the batch (the last
 * assistant message with tool calls), in order:
 *
 * - A call in `finished` gets its finished tool message. It does not run
 *   again.
 * - A call of an answer that stopped at the output limit (finish reason
 *   `length`) is closed as `truncated`. It never runs.
 * - A pending call with `replay: 'never'` is closed as `interrupted`.
 * - A pending call with `replay: 'safe'`, or a call that never started, gets
 *   nothing, so the engine runs it.
 */
export function repairSteps(
  history: ReadonlyArray<ModelMessage>,
  /** The tool calls that started and have no result. */
  pending: ReadonlyArray<PendingTool>,
  /** Tool messages of calls that finished before the crash, by toolCallId. */
  finished?: ReadonlyMap<string, ModelMessage>,
): Array<ModelMessage | ClosedToolCall> {
  // The last answer, with its segments. When the output limit stopped it,
  // its calls are not complete.
  const answer = history.slice(
    history.findLastIndex((message) => message.role !== 'assistant') + 1,
  )
  const cut = new Map(
    answer.flatMap((message) =>
      message.metadata?.tanstack?.finishReason === 'length'
        ? (message.toolCalls ?? [])
            .filter((call) => !isProviderExecutedToolCall(call))
            .map((call) => [call.id, call.function.name] as const)
        : [],
    ),
  )
  const answered = new Set(
    history.flatMap((message) =>
      message.role === 'tool' && message.toolCallId ? [message.toolCallId] : [],
    ),
  )
  const batch = history.findLast(
    (message) => message.role === 'assistant' && message.toolCalls?.length,
  )
  const pendingById = new Map(pending.map((tool) => [tool.toolCallId, tool]))
  const callIds = [
    ...new Set([
      ...cut.keys(),
      ...(batch?.toolCalls ?? []).map((call) => call.id),
      ...pending.map((tool) => tool.toolCallId),
    ]),
  ]
  return callIds
    .filter((toolCallId) => !answered.has(toolCallId))
    .flatMap((toolCallId): Array<ModelMessage | ClosedToolCall> => {
      const result = finished?.get(toolCallId)
      if (result) return [result]
      const toolName = cut.get(toolCallId)
      if (toolName !== undefined) {
        return [{ toolCallId, toolName, reason: 'truncated' }]
      }
      const tool = pendingById.get(toolCallId)
      if (!tool || tool.replay === 'safe') return []
      return [{ toolCallId, toolName: tool.name, reason: 'interrupted' }]
    })
}

/**
 * Prepare the transcript of a crashed thread for a new run, with the
 * {@link repairSteps}. A `truncated` call gets `truncated`, else
 * {@link TRUNCATED_TOOL_RESULT}, as a tool error. An `interrupted` call gets
 * `interrupted`, else {@link INTERRUPTED_TOOL_RESULT}, as a tool error.
 */
export async function repairTranscript(options: {
  messages: MessageStore
  threadId: string
  /** The tool calls that started and have no result. */
  pending: ReadonlyArray<PendingTool>
  /** Tool messages of calls that finished before the crash, by toolCallId. */
  finished?: ReadonlyMap<string, ModelMessage>
  /** The content and error of a cut `replay: 'never'` call. */
  interrupted?: string
  /** The content and error of a call that the output limit cut. */
  truncated?: HarnessDurability['truncatedToolResult']
}): Promise<void> {
  const { messages, threadId, pending, finished, interrupted, truncated } =
    options
  const history = await messages.loadThread(threadId)
  const added = repairSteps(history, pending, finished).map(
    (step): ModelMessage => {
      if (!('reason' in step)) return step
      const { toolCallId, toolName } = step
      if (step.reason === 'truncated') {
        const text = truncatedText(truncated, { toolCallId, toolName })
        return { role: 'tool', toolCallId, content: text, error: text }
      }
      return {
        role: 'tool',
        toolCallId,
        content: interrupted ?? JSON.stringify(INTERRUPTED_TOOL_RESULT),
        error: interrupted ?? INTERRUPTED_TOOL_RESULT.note,
      }
    },
  )
  if (added.length === 0) return
  // Right after the tool calls and the results they have, before messages
  // that came later: a provider needs the results next to the calls.
  const batchAt = history.findLastIndex(
    (message) => message.role === 'assistant' && message.toolCalls?.length,
  )
  let at = batchAt + 1
  while (history[at]?.role === 'tool') at += 1
  if (batchAt === -1) at = history.length
  await messages.saveThread(threadId, [
    ...history.slice(0, at),
    ...added,
    ...history.slice(at),
  ])
}
