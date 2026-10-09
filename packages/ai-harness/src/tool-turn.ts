import { EventType } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import type {
  AdapterYieldChunk,
  DefaultMessageMetadataByModality,
  TextOptions,
} from '@tanstack/ai'
import type { StructuredOutputResult } from '@tanstack/ai/adapters'

/** A `tool` input: one harness tool to run with no model. */
export interface ToolTurn {
  name: string
  args?: unknown
  /** Echoed as a `tanstack.injection` custom event, for example a trigger. */
  meta?: Record<string, unknown>
}

/** The custom event that carries the `meta` of a `tool` input. */
export const TOOL_INJECTION_EVENT = 'tanstack.injection'

/**
 * The model of a `tool` turn. Its first call asks for the one tool, and the
 * call that sees the result ends the turn. So the call takes the path of a
 * model call: middleware, the final input check, `permissions()`, approvals,
 * and durable steps. The call id comes from the input id, so a recovered
 * turn does not run the tool again.
 */
export class ToolTurnAdapter extends BaseTextAdapter<
  'harness-tool',
  Record<string, never>,
  ReadonlyArray<'text'>,
  DefaultMessageMetadataByModality
> {
  readonly name = 'harness-tool'
  private readonly turn: ToolTurn
  private readonly toolCallId: string

  constructor(turn: ToolTurn, toolCallId: string) {
    super({}, 'harness-tool')
    this.turn = turn
    this.toolCallId = toolCallId
  }

  async *chatStream(options: TextOptions): AsyncIterable<AdapterYieldChunk> {
    const { toolCallId, model } = this
    const runId = options.runId ?? toolCallId
    const threadId = options.threadId ?? ''
    const isAnswered = options.messages.some(
      (message) => message.role === 'tool' && message.toolCallId === toolCallId,
    )
    const now = Date.now()
    yield {
      type: EventType.RUN_STARTED,
      runId,
      threadId,
      model,
      timestamp: now,
    }
    if (!isAnswered) {
      const { name, args, meta } = this.turn
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: name,
        toolName: name,
        model,
        timestamp: now,
        index: 0,
      }
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: JSON.stringify(args ?? {}),
        model,
        timestamp: now,
      }
      yield { type: EventType.TOOL_CALL_END, toolCallId, model, timestamp: now }
      if (meta) {
        yield {
          type: EventType.CUSTOM,
          name: TOOL_INJECTION_EVENT,
          value: { toolCallId, ...meta },
          timestamp: now,
        }
      }
    }
    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      model,
      timestamp: now,
      finishReason: isAnswered ? 'stop' : 'tool_calls',
    }
  }

  structuredOutput(): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(new Error('A tool turn has no model.'))
  }
}
