import {
  EventType,
  readInterruptBinding,
  toSpecTokenUsage,
  withTanstackMetadata,
} from '@tanstack/ai'
import type {
  Interrupt,
  RunFinishedEvent,
  SpecTokenUsage,
  StreamChunk,
  ToolCallResultEvent,
} from '@tanstack/ai'
import type { AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core'
import type {
  AssistantMessage,
  AssistantMessageEvent,
  StopReason,
  ToolCall,
  ToolResultMessage,
  Usage,
} from '@earendil-works/pi-ai'
import {
  emptyUsage,
  fromPiToolContent,
  parseJsonObject,
  toPiToolContent,
} from './messages'
import type { PiModelFields } from './messages'
import type { PiBridgeEvent, TanStackPiMessage } from './request'

type FinishReason = RunFinishedEvent['finishReason']

/** TanStack marks a redacted thinking block by this reasoning message id prefix. */
const REDACTED_PREFIX = 'redacted_thinking-'

function toPiStopReason(reason: FinishReason): StopReason {
  if (reason === 'tool_calls') return 'toolUse'
  if (reason === 'length') return 'length'
  return 'stop'
}

function fromPiStopReason(reason: StopReason): FinishReason {
  if (reason === 'toolUse') return 'tool_calls'
  if (reason === 'length') return 'length'
  return 'stop'
}

/** `metadata.tanstack[key]` of an event, or undefined. */
function tanstackField(metadata: unknown, key: string): unknown {
  if (typeof metadata !== 'object' || metadata === null) return undefined
  const tanstack: unknown = Reflect.get(metadata, 'tanstack')
  if (typeof tanstack !== 'object' || tanstack === null) return undefined
  return Reflect.get(tanstack, key)
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined
}

function stringField(value: unknown, key: string): string | undefined {
  const found = field(value, key)
  return typeof found === 'string' ? found : undefined
}

/**
 * TanStack run usage as one pi `Usage`. The AG-UI counts include the cache.
 * The cost is the TanStack `cost`, on the usage or in `metadata.tanstack`.
 */
function toPiUsage(usage: RunFinishedEvent['usage'], metadata: unknown): Usage {
  const list =
    usage === undefined
      ? []
      : Array.isArray(usage)
        ? usage
        : toSpecTokenUsage(usage).usage
  const out = emptyUsage()
  for (const entry of list) {
    const cacheRead = entry.cachedInputTokens ?? 0
    const cacheWrite = entry.cacheWriteInputTokens ?? 0
    out.input += (entry.inputTokens ?? 0) - cacheRead - cacheWrite
    out.output += entry.outputTokens ?? 0
    out.cacheRead += cacheRead
    out.cacheWrite += cacheWrite
    out.totalTokens += entry.totalTokens ?? 0
    if (entry.reasoningTokens !== undefined) {
      out.reasoning = (out.reasoning ?? 0) + entry.reasoningTokens
    }
  }
  const cost =
    field(Array.isArray(usage) ? undefined : usage, 'cost') ??
    field(tanstackField(metadata, 'usage'), 'cost')
  if (typeof cost === 'number') out.cost.total = cost
  return out
}

function fromPiUsage(message: AssistantMessage): Array<SpecTokenUsage> {
  const { usage } = message
  return [
    {
      provider: message.provider,
      model: message.model,
      inputTokens: usage.input + usage.cacheRead + usage.cacheWrite,
      outputTokens: usage.output,
      totalTokens: usage.totalTokens,
      ...(usage.cacheRead > 0 && { cachedInputTokens: usage.cacheRead }),
      ...(usage.cacheWrite > 0 && { cacheWriteInputTokens: usage.cacheWrite }),
      ...(usage.reasoning !== undefined && {
        reasoningTokens: usage.reasoning,
      }),
    },
  ]
}

/** One model call: the pi turn of one assistant message and its tool results. */
interface Turn {
  message: AssistantMessage
  toolResults: Array<ToolResultMessage>
  /** The assistant message has ended. Tool results can still come. */
  ended: boolean
  /** Content index by AG-UI id: reasoning message ids and tool call ids. */
  index: Map<string, number>
  /** Content index of the open text block. */
  text?: number
  /** Streamed argument text by tool call id. */
  args: Map<string, string>
}

/** The AG-UI events that `toPiAgentEvents` maps to pi events. */
const MAPPED_EVENTS: ReadonlySet<string> = new Set([
  EventType.RUN_STARTED,
  EventType.RUN_FINISHED,
  EventType.RUN_ERROR,
  EventType.TEXT_MESSAGE_START,
  EventType.TEXT_MESSAGE_CONTENT,
  EventType.TEXT_MESSAGE_END,
  EventType.REASONING_START,
  EventType.REASONING_END,
  EventType.REASONING_MESSAGE_START,
  EventType.REASONING_MESSAGE_CONTENT,
  EventType.REASONING_MESSAGE_END,
  EventType.REASONING_ENCRYPTED_VALUE,
  EventType.TOOL_CALL_START,
  EventType.TOOL_CALL_ARGS,
  EventType.TOOL_CALL_END,
  EventType.TOOL_CALL_RESULT,
])

/**
 * Convert the AG-UI event stream of `chat()` into pi agent events, the
 * `AgentEvent`s of `@earendil-works/pi-agent-core`. A pi UI that reads
 * `agentLoop()` or `Agent.subscribe()` can read this stream instead.
 *
 * Each model call is one pi turn with one assistant message. The tool results
 * that `chat()` runs become `tool_execution_*` events and `toolResult`
 * messages of that turn. `agent_end` carries the messages of the run, without
 * the prompt messages, which `chat()` does not stream.
 *
 * Two kinds of pi message carry what pi has no type for. They come as
 * `message_start` and `message_end`, and are not in the `agent_end` list:
 *
 * - `tanstack-interrupt`: the run paused for a tool approval, a client tool
 *   or another interrupt. Answer it with `resume` on the next request.
 * - `tanstack-event`: state, activity, steps, custom events and subagent
 *   events, as the AG-UI event.
 *
 * Pass `model` (the pi model fields) to stamp the assistant messages.
 * Otherwise they get the provider and model of the `chat()` adapter, and an
 * empty `api`.
 */
export async function* toPiAgentEvents(
  stream: AsyncIterable<StreamChunk>,
  { model }: { model?: PiModelFields } = {},
): AsyncGenerator<PiBridgeEvent> {
  const messages: Array<AgentMessage> = []
  let fields: PiModelFields = model ?? { api: '', provider: '', model: '' }
  let started = false
  let turn: Turn | undefined

  function* start(): Generator<PiBridgeEvent> {
    if (started) return
    started = true
    yield { type: 'agent_start' }
  }

  function* custom(message: TanStackPiMessage): Generator<PiBridgeEvent> {
    yield* start()
    yield { type: 'message_start', message }
    yield { type: 'message_end', message }
  }

  function* endTurn(): Generator<PiBridgeEvent> {
    if (!turn) return
    yield* endMessage({})
    yield {
      type: 'turn_end',
      message: turn.message,
      toolResults: turn.toolResults,
    }
    turn = undefined
  }

  /** The open assistant message. A new model call starts a new turn. */
  function* open(): Generator<PiBridgeEvent, Turn> {
    if (turn && !turn.ended) return turn
    yield* start()
    yield* endTurn()
    const message: AssistantMessage = {
      role: 'assistant',
      content: [],
      ...fields,
      usage: emptyUsage(),
      stopReason: 'pending',
      timestamp: Date.now(),
    }
    const next: Turn = {
      message,
      toolResults: [],
      ended: false,
      index: new Map(),
      args: new Map(),
    }
    turn = next
    yield { type: 'turn_start' }
    yield { type: 'message_start', message }
    return next
  }

  function* endMessage(
    final: Partial<AssistantMessage>,
  ): Generator<PiBridgeEvent> {
    if (!turn || turn.ended) return
    turn.ended = true
    Object.assign(turn.message, { stopReason: 'stop' }, final)
    messages.push(turn.message)
    yield { type: 'message_end', message: turn.message }
  }

  function update(
    current: Turn,
    event: DistributiveOmit<AssistantMessageEvent, 'partial'>,
  ): AgentEvent {
    return {
      type: 'message_update',
      message: current.message,
      // `partial` is the live message, as in pi.
      assistantMessageEvent: {
        ...event,
        partial: current.message,
      } as AssistantMessageEvent,
    }
  }

  function toolCallOf(id: string): ToolCall | undefined {
    const at = turn?.index.get(`call:${id}`)
    const block = at === undefined ? undefined : turn?.message.content[at]
    return block?.type === 'toolCall' ? block : undefined
  }

  for await (const event of stream) {
    const subagent =
      'subagentRunId' in event && event.subagentRunId !== undefined
    if (subagent || !MAPPED_EVENTS.has(event.type)) {
      yield* custom({ role: 'tanstack-event', event, timestamp: Date.now() })
      continue
    }

    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- the other events become tanstack-event messages above.
    switch (event.type) {
      case EventType.RUN_STARTED: {
        yield* start()
        const source = tanstackField(event.metadata, 'source')
        if (!model) {
          fields = {
            api: '',
            provider: stringField(source, 'provider') ?? '',
            model: stringField(source, 'model') ?? '',
          }
        }
        break
      }

      case EventType.TEXT_MESSAGE_START: {
        const current = yield* open()
        current.text =
          current.message.content.push({ type: 'text', text: '' }) - 1
        yield update(current, {
          type: 'text_start',
          contentIndex: current.text,
        })
        break
      }
      case EventType.TEXT_MESSAGE_CONTENT: {
        const block =
          turn?.text === undefined ? undefined : turn.message.content[turn.text]
        if (!turn || turn.text === undefined || block?.type !== 'text') break
        block.text += event.delta
        yield update(turn, {
          type: 'text_delta',
          contentIndex: turn.text,
          delta: event.delta,
        })
        break
      }
      case EventType.TEXT_MESSAGE_END: {
        const block =
          turn?.text === undefined ? undefined : turn.message.content[turn.text]
        if (!turn || turn.text === undefined || block?.type !== 'text') break
        yield update(turn, {
          type: 'text_end',
          contentIndex: turn.text,
          content: block.text,
        })
        turn.text = undefined
        break
      }

      case EventType.REASONING_MESSAGE_START: {
        const current = yield* open()
        const at =
          current.message.content.push({
            type: 'thinking',
            thinking: '',
            ...(event.messageId.startsWith(REDACTED_PREFIX) && {
              redacted: true,
            }),
          }) - 1
        current.index.set(`reasoning:${event.messageId}`, at)
        yield update(current, { type: 'thinking_start', contentIndex: at })
        break
      }
      case EventType.REASONING_MESSAGE_CONTENT: {
        const at = turn?.index.get(`reasoning:${event.messageId}`)
        const block = at === undefined ? undefined : turn?.message.content[at]
        if (!turn || at === undefined || block?.type !== 'thinking') break
        block.thinking += event.delta
        yield update(turn, {
          type: 'thinking_delta',
          contentIndex: at,
          delta: event.delta,
        })
        break
      }
      case EventType.REASONING_MESSAGE_END: {
        const at = turn?.index.get(`reasoning:${event.messageId}`)
        const block = at === undefined ? undefined : turn?.message.content[at]
        if (!turn || at === undefined || block?.type !== 'thinking') break
        yield update(turn, {
          type: 'thinking_end',
          contentIndex: at,
          content: block.thinking,
        })
        break
      }
      case EventType.REASONING_ENCRYPTED_VALUE: {
        if (event.subtype === 'tool-call') {
          const call = toolCallOf(event.entityId)
          if (call) call.thoughtSignature = event.encryptedValue
          break
        }
        // ponytail: only a signature sent before REASONING_MESSAGE_END lands
        // in that end event, the order the TanStack adapters use.
        const at = turn?.index.get(`reasoning:${event.entityId}`)
        const block = at === undefined ? undefined : turn?.message.content[at]
        if (block?.type === 'thinking') {
          block.thinkingSignature = event.encryptedValue
        }
        break
      }

      case EventType.TOOL_CALL_START: {
        const current = yield* open()
        const signature = stringField(event.metadata, 'thoughtSignature')
        const at =
          current.message.content.push({
            type: 'toolCall',
            id: event.toolCallId,
            name: event.toolCallName,
            arguments: {},
            ...(signature !== undefined && { thoughtSignature: signature }),
          }) - 1
        current.index.set(`call:${event.toolCallId}`, at)
        yield update(current, { type: 'toolcall_start', contentIndex: at })
        break
      }
      case EventType.TOOL_CALL_ARGS: {
        const at = turn?.index.get(`call:${event.toolCallId}`)
        if (!turn || at === undefined || event.delta === '') break
        turn.args.set(
          event.toolCallId,
          (turn.args.get(event.toolCallId) ?? '') + event.delta,
        )
        yield update(turn, {
          type: 'toolcall_delta',
          contentIndex: at,
          delta: event.delta,
        })
        break
      }
      case EventType.TOOL_CALL_END: {
        const at = turn?.index.get(`call:${event.toolCallId}`)
        const call = toolCallOf(event.toolCallId)
        if (!turn || at === undefined || !call) break
        const input: unknown = event.input
        call.arguments =
          typeof input === 'object' && input !== null && !Array.isArray(input)
            ? parseJsonObject(JSON.stringify(input))
            : parseJsonObject(turn.args.get(event.toolCallId) ?? '')
        yield update(turn, {
          type: 'toolcall_end',
          contentIndex: at,
          toolCall: call,
        })
        break
      }

      case EventType.TOOL_CALL_RESULT: {
        const call = toolCallOf(event.toolCallId)
        if (!turn || !call) break
        // chat() sends only the result, so the execution starts and ends here.
        yield {
          type: 'tool_execution_start',
          toolCallId: call.id,
          toolName: call.name,
          args: call.arguments,
        }
        const isError =
          tanstackField(event.metadata, 'state') === 'output-error'
        const content = toPiToolContent(
          typeof event.content === 'string'
            ? event.content
            : JSON.stringify(event.content),
        )
        yield {
          type: 'tool_execution_end',
          toolCallId: call.id,
          toolName: call.name,
          result: { content, details: undefined },
          isError,
        }
        const result: ToolResultMessage = {
          role: 'toolResult',
          toolCallId: call.id,
          toolName: call.name,
          content,
          isError,
          timestamp: Date.now(),
        }
        turn.toolResults.push(result)
        messages.push(result)
        yield { type: 'message_start', message: result }
        yield { type: 'message_end', message: result }
        break
      }

      case EventType.RUN_FINISHED: {
        // A model call with no content is still a turn.
        yield* open()
        const finishReason =
          event.finishReason ??
          (tanstackField(event.metadata, 'finishReason') as FinishReason)
        const responseId =
          event.responseId ??
          stringField(event.metadata?.tanstack, 'responseId')
        yield* endMessage({
          stopReason: toPiStopReason(finishReason),
          usage: toPiUsage(event.usage, event.metadata),
          ...(responseId !== undefined && { responseId }),
        })
        if (event.outcome?.type === 'interrupt') {
          const { interrupts } = event.outcome
          yield* custom({
            role: 'tanstack-interrupt',
            runId:
              (interrupts[0] &&
                readInterruptBinding(interrupts[0])?.interruptedRunId) ??
              event.runId,
            interrupts,
            timestamp: Date.now(),
          })
        }
        break
      }

      case EventType.RUN_ERROR:
        yield* open()
        yield* endMessage({
          stopReason: 'error',
          errorMessage: event.message,
          usage: toPiUsage(event.usage, event.metadata),
        })
        yield* endTurn()
        yield { type: 'agent_end', messages }
        return
    }
  }

  yield* start()
  yield* endTurn()
  yield { type: 'agent_end', messages }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

/** Options for {@link fromPiAgentEvents}. */
export interface FromPiAgentEventsOptions {
  threadId: string
  runId: string
  /**
   * The tool calls that the run paused, with the interrupt to send for each.
   * Their blocked pi tool results stay off the stream, and the turn ends
   * with an interrupt. `runPiAgent` fills it while the loop runs.
   */
  interrupts?: ReadonlyMap<string, Interrupt>
  /** Tool results to send first: the answers to a resumed run's interrupts. */
  results?: ReadonlyArray<ToolResultMessage>
  /**
   * Which app messages (`CustomAgentMessages`) that pi adds mid-run go to the
   * client as `pi.message` events. Mid-run user messages always go, and pi
   * system messages never do. Default: none.
   */
  forwardMessage?: (message: AgentMessage) => boolean
}

/** A pi tool result as the AG-UI tool result event. */
function toolResultEvent(
  message: ToolResultMessage,
  messageId: string,
): ToolCallResultEvent {
  const content = fromPiToolContent(message.content)
  const result: ToolCallResultEvent = {
    type: EventType.TOOL_CALL_RESULT,
    messageId,
    toolCallId: message.toolCallId,
    // The AG-UI wire form of a multimodal result is the JSON parts.
    content:
      typeof content !== 'string'
        ? JSON.stringify(content)
        : content ||
          (message.details === undefined
            ? ''
            : JSON.stringify(message.details)),
    role: 'tool',
  }
  return message.isError
    ? withTanstackMetadata(result, { state: 'output-error' })
    : result
}

/**
 * Convert pi agent events, from `agentLoop()` or `Agent.subscribe()`, into the
 * AG-UI events of `chat()`. Serve them with `toServerSentEventsResponse`, and
 * TanStack `useChat` reads the pi agent like a `chat()` route.
 *
 * Each pi assistant message ends with a `RUN_FINISHED`, as each model call
 * of `chat()` does. A tool-use message ends after its tool results. A tool
 * result becomes a `TOOL_CALL_RESULT`, an error tool result with the
 * `output-error` state. An assistant message that stopped with an error or an
 * abort becomes a `RUN_ERROR`.
 *
 * pi data that has no AG-UI event becomes a `CUSTOM` event:
 *
 * - `pi.tool-progress`: a partial tool result (`tool_execution_update`),
 *   with `toolCallId`, `toolName` and `partialResult`.
 * - `pi.message`: a user message that pi adds mid-run (steering or
 *   follow-up), or an app message that `forwardMessage` allows. pi system
 *   messages stay on the server.
 *
 * The cost of a model call is the TanStack usage `cost`.
 */
export async function* fromPiAgentEvents(
  events: AsyncIterable<AgentEvent>,
  {
    threadId,
    runId,
    interrupts = new Map(),
    results = [],
    forwardMessage = () => false,
  }: FromPiAgentEventsOptions,
): AsyncGenerator<StreamChunk> {
  let messageId = ''
  let count = 0
  let finished = false
  // The prompt comes before the first assistant message. The client sent it.
  let prompted = false
  // A tool-use message ends at turn_end, after its tool results, so a paused
  // call can end the run with an interrupt.
  let pending: AssistantMessage | undefined
  const argsSent = new Set<string>()
  const reasoningIds = new Map<number, string>()

  function reasoningId(
    index: number,
    block?: AssistantMessage['content'][number],
  ): string {
    const known = reasoningIds.get(index)
    if (known !== undefined) return known
    const redacted = block?.type === 'thinking' && block.redacted === true
    const id = `${redacted ? REDACTED_PREFIX : ''}${messageId}-reasoning-${index}`
    reasoningIds.set(index, id)
    return id
  }

  function finishedEvent(message: AssistantMessage): StreamChunk {
    const paused = message.content.flatMap((block) => {
      const interrupt =
        block.type === 'toolCall' ? interrupts.get(block.id) : undefined
      return interrupt ? [interrupt] : []
    })
    const event: RunFinishedEvent = {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      model: message.model,
      finishReason: fromPiStopReason(message.stopReason),
      ...(message.responseId !== undefined && {
        responseId: message.responseId,
      }),
      usage: fromPiUsage(message),
      ...(paused.length > 0 && {
        outcome: { type: 'interrupt', interrupts: paused },
      }),
    }
    const cost = message.usage.cost.total
    return cost > 0 ? withTanstackMetadata(event, { usage: { cost } }) : event
  }

  function* flush(): Generator<StreamChunk> {
    if (!pending) return
    const message = pending
    pending = undefined
    finished = true
    yield finishedEvent(message)
  }

  yield { type: EventType.RUN_STARTED, threadId, runId }
  for (const result of results) yield toolResultEvent(result, result.toolCallId)

  for await (const event of events) {
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- turn_start, tool_execution_start and _end carry nothing the messages do not.
    switch (event.type) {
      case 'message_start':
        if ('role' in event.message && event.message.role === 'assistant') {
          yield* flush()
          prompted = true
          messageId = `${runId}-${++count}`
          reasoningIds.clear()
        }
        break

      case 'message_update':
        yield* fromAssistantEvent(event.assistantMessageEvent)
        break

      case 'tool_execution_update':
        yield {
          type: EventType.CUSTOM,
          name: 'pi.tool-progress',
          value: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            partialResult: event.partialResult,
          },
        }
        break

      case 'message_end': {
        const message = event.message
        const role = 'role' in message ? message.role : undefined
        if (message.role === 'toolResult') {
          if (!interrupts.has(message.toolCallId)) {
            yield toolResultEvent(message, messageId)
          }
          break
        }
        if (message.role !== 'assistant') {
          // pi system messages hold the prompt and the tool definitions, so
          // they stay on the server. App messages need `forwardMessage`.
          if (
            prompted &&
            role !== 'system' &&
            (role === 'user' || forwardMessage(message))
          ) {
            yield {
              type: EventType.CUSTOM,
              name: 'pi.message',
              value: message,
            }
          }
          break
        }
        // A pi provider can set the signatures only on the final message.
        for (const [index, block] of message.content.entries()) {
          const encryptedValue =
            block.type === 'thinking'
              ? block.thinkingSignature
              : block.type === 'toolCall'
                ? block.thoughtSignature
                : undefined
          if (!encryptedValue) continue
          yield {
            type: EventType.REASONING_ENCRYPTED_VALUE,
            subtype: block.type === 'toolCall' ? 'tool-call' : 'message',
            entityId:
              block.type === 'toolCall' ? block.id : reasoningId(index, block),
            encryptedValue,
          }
        }
        if (
          message.stopReason === 'error' ||
          message.stopReason === 'aborted'
        ) {
          yield {
            type: EventType.RUN_ERROR,
            threadId,
            runId,
            message: message.errorMessage ?? message.stopReason,
            model: message.model,
          }
          return
        }
        if (message.stopReason === 'toolUse') {
          pending = message
          break
        }
        finished = true
        yield finishedEvent(message)
        break
      }

      case 'turn_end':
        yield* flush()
        break

      case 'agent_end':
        yield* flush()
        if (!finished) {
          yield {
            type: EventType.RUN_FINISHED,
            threadId,
            runId,
            finishReason: 'stop',
          }
        }
        return
    }
  }
  yield* flush()

  function* fromAssistantEvent(
    event: AssistantMessageEvent,
  ): Generator<StreamChunk> {
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- start, done and error come again on message_start and message_end.
    switch (event.type) {
      case 'text_start':
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        }
        break
      case 'text_delta':
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: event.delta,
        }
        break
      case 'text_end':
        yield { type: EventType.TEXT_MESSAGE_END, messageId }
        break

      case 'thinking_start':
        yield {
          type: EventType.REASONING_MESSAGE_START,
          messageId: reasoningId(
            event.contentIndex,
            event.partial.content[event.contentIndex],
          ),
          role: 'reasoning',
        }
        break
      case 'thinking_delta':
        yield {
          type: EventType.REASONING_MESSAGE_CONTENT,
          messageId: reasoningId(event.contentIndex),
          delta: event.delta,
        }
        break
      case 'thinking_end':
        yield {
          type: EventType.REASONING_MESSAGE_END,
          messageId: reasoningId(event.contentIndex),
        }
        break

      case 'toolcall_start': {
        const block = event.partial.content[event.contentIndex]
        if (block?.type !== 'toolCall') break
        yield {
          type: EventType.TOOL_CALL_START,
          toolCallId: block.id,
          toolCallName: block.name,
          parentMessageId: messageId,
          ...(block.thoughtSignature !== undefined && {
            metadata: { thoughtSignature: block.thoughtSignature },
          }),
        }
        break
      }
      case 'toolcall_delta': {
        const block = event.partial.content[event.contentIndex]
        if (block?.type !== 'toolCall' || event.delta === '') break
        argsSent.add(block.id)
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: block.id,
          delta: event.delta,
        }
        break
      }
      case 'toolcall_end': {
        const call = event.toolCall
        // A provider can send the whole arguments at the start, with no deltas.
        if (!argsSent.has(call.id)) {
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: call.id,
            delta: JSON.stringify(call.arguments),
          }
        }
        yield {
          type: EventType.TOOL_CALL_END,
          toolCallId: call.id,
          input: call.arguments,
        }
        break
      }
    }
  }
}
