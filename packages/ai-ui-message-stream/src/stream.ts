import {
  EventType,
  INTERRUPT_BINDING_VERSION,
  RUN_ACCEPTED_EVENT,
  hashSchemaInput,
  normalizeApprovalSchema,
  readInterruptBinding,
  withInterruptBinding,
} from '@tanstack/ai'
import type {
  AnyClientTool,
  Interrupt,
  StreamChunk,
  ToolResultOutcome,
} from '@tanstack/ai'
import type { FinishReason, ProviderMetadata, UIMessageChunk } from 'ai'
import { DataParts, dataChunkEvent, isDataChunk } from './data-parts'

const TO_AI_SDK_FINISH: Partial<Record<string, FinishReason>> = {
  stop: 'stop',
  length: 'length',
  content_filter: 'content-filter',
  tool_calls: 'tool-calls',
}

const FROM_AI_SDK_FINISH: Record<
  FinishReason,
  'stop' | 'length' | 'content_filter' | null
> = {
  stop: 'stop',
  length: 'length',
  'content-filter': 'content_filter',
  // A TanStack `tool_calls` finish means more steps follow in the same
  // stream. An AI SDK stream has ended here, and the client must run its
  // tools, so the reason is left out.
  'tool-calls': null,
  error: null,
  other: null,
}

/** TanStack marks a redacted thinking block by this reasoning message id prefix. */
const REDACTED_PREFIX = 'redacted_thinking-'

/** `metadata.tanstack[key]`, or undefined. */
export function tanstackField(metadata: unknown, key: string): unknown {
  const tanstack: unknown =
    typeof metadata === 'object' && metadata !== null && 'tanstack' in metadata
      ? metadata.tanstack
      : undefined
  return typeof tanstack === 'object' && tanstack !== null && key in tanstack
    ? Reflect.get(tanstack, key)
    : undefined
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Tool output as the AI SDK client renders it: parsed JSON, else the text. */
function parseOutput(content: string | ReadonlyArray<unknown>): unknown {
  if (typeof content !== 'string') return content
  return parseJson(content) ?? content
}

/**
 * Convert the AG-UI event stream of `chat()` into an AI SDK UI message
 * stream. Serve it with the AI SDK's `createUIMessageStreamResponse`, and the
 * AI SDK `useChat` reads it like a `streamText` route.
 *
 * A tool approval becomes a `tool-approval-request` chunk. Read the answer
 * with `chatParamsFromAISDKRequest`. The message metadata gets the paused
 * TanStack run id as `{ tanstack: { runId } }`, so the answer resumes that
 * run. A subagent's approval shows on its card only. An activity becomes a `data-<activityType>`
 * part, shared state a `data-state` part, and each subagent a `data-subagent`
 * card, each updated in place by id. A CUSTOM event becomes a transient
 * `data-<name>` chunk, which reaches `onData`.
 */
export function toUIMessageStream(
  stream: AsyncIterable<StreamChunk>,
): ReadableStream<UIMessageChunk> {
  async function* convert(): AsyncGenerator<UIMessageChunk> {
    let started = false
    let errored = false
    let finishReason: FinishReason | undefined
    const tools = new Map<string, { name: string; args: string }>()
    const signatures = new Map<string, string>()
    const dataParts = new DataParts()

    function* start(messageId?: string): Generator<UIMessageChunk> {
      if (started) return
      started = true
      yield messageId === undefined
        ? { type: 'start' }
        : { type: 'start', messageId }
    }

    for await (const event of stream) {
      // A subagent's events go to its card, not to this message.
      if ('subagentRunId' in event && event.subagentRunId !== undefined) {
        const chunks = dataParts.chunks(event)
        if (chunks.length > 0) {
          yield* start()
          yield* chunks
        }
        continue
      }

      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- steps and message snapshots have no AI SDK chunk; default skips them.
      switch (event.type) {
        case EventType.TEXT_MESSAGE_START:
          yield* start(event.messageId)
          yield { type: 'text-start', id: event.messageId }
          break
        case EventType.TEXT_MESSAGE_CONTENT:
          yield { type: 'text-delta', id: event.messageId, delta: event.delta }
          break
        case EventType.TEXT_MESSAGE_END:
          yield { type: 'text-end', id: event.messageId }
          break

        case EventType.REASONING_MESSAGE_START:
          yield* start()
          yield { type: 'reasoning-start', id: event.messageId }
          break
        case EventType.REASONING_MESSAGE_CONTENT:
          yield {
            type: 'reasoning-delta',
            id: event.messageId,
            delta: event.delta,
          }
          break
        case EventType.REASONING_ENCRYPTED_VALUE:
          // ponytail: only a signature sent before REASONING_MESSAGE_END is
          // kept, which is the order the TanStack adapters use. Buffer the
          // reasoning-end if an adapter ever sends it later.
          if (event.subtype === 'message') {
            signatures.set(event.entityId, event.encryptedValue)
          }
          break
        case EventType.REASONING_MESSAGE_END: {
          const signature = signatures.get(event.messageId)
          const providerMetadata: ProviderMetadata | undefined =
            signature === undefined
              ? undefined
              : {
                  tanstack: {
                    signature,
                    ...(event.messageId.startsWith(REDACTED_PREFIX) && {
                      redacted: true,
                    }),
                  },
                }
          yield {
            type: 'reasoning-end',
            id: event.messageId,
            ...(providerMetadata && { providerMetadata }),
          }
          break
        }

        case EventType.TOOL_CALL_START:
          yield* start(event.parentMessageId)
          tools.set(event.toolCallId, { name: event.toolCallName, args: '' })
          yield {
            type: 'tool-input-start',
            toolCallId: event.toolCallId,
            toolName: event.toolCallName,
          }
          break
        case EventType.TOOL_CALL_ARGS: {
          const tool = tools.get(event.toolCallId)
          if (tool) tool.args += event.delta
          yield {
            type: 'tool-input-delta',
            toolCallId: event.toolCallId,
            inputTextDelta: event.delta,
          }
          break
        }
        case EventType.TOOL_CALL_END: {
          const tool = tools.get(event.toolCallId)
          if (!tool) break
          const input =
            tanstackField(event.metadata, 'input') ??
            (tool.args === '' ? {} : parseJson(tool.args))
          yield {
            type: 'tool-input-available',
            toolCallId: event.toolCallId,
            toolName: tool.name,
            input,
          }
          break
        }
        case EventType.TOOL_CALL_RESULT:
          // A resumed run can start with a result. A start without an id
          // keeps the AI SDK message that holds the tool call.
          yield* start()
          if (tanstackField(event.metadata, 'toolResultOutcome') === 'denied') {
            yield { type: 'tool-output-denied', toolCallId: event.toolCallId }
          } else if (
            tanstackField(event.metadata, 'state') === 'output-error'
          ) {
            yield {
              type: 'tool-output-error',
              toolCallId: event.toolCallId,
              errorText:
                typeof event.content === 'string'
                  ? event.content
                  : JSON.stringify(event.content),
            }
          } else {
            yield {
              type: 'tool-output-available',
              toolCallId: event.toolCallId,
              output: parseOutput(event.content),
            }
          }
          break

        case EventType.ACTIVITY_SNAPSHOT:
        case EventType.ACTIVITY_DELTA:
        case EventType.STATE_SNAPSHOT:
        case EventType.STATE_DELTA:
          yield* start()
          yield* dataParts.chunks(event)
          break

        case EventType.CUSTOM:
          // The durability log marks an accepted run. It is not app data.
          if (event.name === RUN_ACCEPTED_EVENT) break
          yield* start()
          yield {
            type: `data-${event.name}`,
            data: event.value,
            transient: true,
          }
          break

        case EventType.RUN_FINISHED: {
          const reason = tanstackField(event.metadata, 'finishReason')
          if (typeof reason === 'string')
            finishReason = TO_AI_SDK_FINISH[reason]
          // A tool approval pauses the run. A client tool needs no chunk: the
          // AI SDK client runs a tool call that has no output. A subagent's
          // tool call is not in this message (the AI SDK client throws on an
          // unknown one), so its approval shows on the subagent card only.
          if (event.outcome?.type === 'interrupt') {
            for (const interrupt of event.outcome.interrupts) {
              if (
                interrupt.metadata?.kind !== 'approval' ||
                interrupt.toolCallId === undefined ||
                !tools.has(interrupt.toolCallId)
              )
                continue
              yield* start()
              yield {
                type: 'tool-approval-request',
                approvalId: interrupt.id,
                toolCallId: interrupt.toolCallId,
              }
              // The binding names the paused run. The event `runId` can be
              // the adapter's own id.
              const runId = readInterruptBinding(interrupt)?.interruptedRunId
              if (runId !== undefined) {
                yield {
                  type: 'message-metadata',
                  messageMetadata: { tanstack: { runId } },
                }
              }
            }
          }
          break
        }
        case EventType.RUN_ERROR:
          errored = true
          yield { type: 'error', errorText: event.message }
          break

        default:
          break
      }
    }

    if (errored) return
    yield* start()
    yield finishReason === undefined
      ? { type: 'finish' }
      : { type: 'finish', finishReason }
  }

  const iterator = convert()
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      const { done, value } = await iterator.next()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    async cancel() {
      await iterator.return(undefined)
    },
  })
}

/** Options for {@link fromUIMessageStream}. */
export interface FromUIMessageStreamOptions {
  threadId: string
  runId: string
  /**
   * The client's tools, as passed to `useChat({ tools })`. A tool approval for
   * one of them with `needsApproval: true` is a `tool-approval` interrupt.
   */
  tools?: ReadonlyArray<AnyClientTool>
}

/**
 * Convert an AI SDK UI message stream into AG-UI events for the TanStack chat
 * client. All text and tool calls go into one assistant message, as the AI
 * SDK builds them.
 *
 * A tool approval request ends the run with an approval interrupt. For a
 * tool in `tools`, it is a `tool-approval` interrupt: answer it with
 * `resolveInterrupt(true)` or `client.resolveInterrupts(true)`. For another
 * tool, it is a generic interrupt: answer it with
 * `resolveInterrupt({ approved })`. The next request sends the tool part as
 * `approval-responded`. Sources, files
 * and step boundaries are skipped. A `data-<name>` part with an id and object
 * data becomes an activity of type `<name>`. Other data chunks become CUSTOM
 * events named `data-<name>`.
 */
export async function* fromUIMessageStream(
  stream: ReadableStream<UIMessageChunk>,
  { threadId, runId, tools: clientTools }: FromUIMessageStreamOptions,
): AsyncGenerator<StreamChunk> {
  let messageId = `${runId}-assistant`
  let ended = false
  // AI SDK reasoning ids are only unique inside one step, so each reasoning
  // part gets its own AG-UI message id.
  const reasoningIds = new Map<string, string>()
  let reasoningCount = 0
  const tools = new Map<string, { started: boolean; hasArgs: boolean }>()
  const inputs = new Map<string, { toolName: string; input: unknown }>()
  const approvals: Array<Interrupt> = []

  function* finished(
    metadata?: Record<string, unknown>,
  ): Generator<StreamChunk> {
    yield {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      outcome:
        approvals.length > 0
          ? { type: 'interrupt', interrupts: approvals }
          : { type: 'success' },
      ...(metadata && { metadata }),
    }
  }

  function* ensureToolStarted(
    toolCallId: string,
    toolName: string,
    input: unknown,
  ): Generator<StreamChunk> {
    let tool = tools.get(toolCallId)
    if (!tool) {
      tool = { started: true, hasArgs: false }
      tools.set(toolCallId, tool)
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: toolName,
        parentMessageId: messageId,
      }
    }
    if (!tool.hasArgs) {
      tool.hasArgs = true
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: JSON.stringify(input ?? {}),
      }
    }
  }

  yield { type: EventType.RUN_STARTED, threadId, runId }

  for await (const chunk of stream) {
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- sources, files, steps and approvals are skipped; default maps data parts.
    switch (chunk.type) {
      case 'start':
        if (chunk.messageId !== undefined) messageId = chunk.messageId
        break

      // Every AI SDK text part belongs to the one assistant message. The
      // TanStack client starts a new text segment on each START.
      case 'text-start':
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        }
        break
      case 'text-delta':
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: chunk.delta,
        }
        break
      case 'text-end':
        yield { type: EventType.TEXT_MESSAGE_END, messageId }
        break

      case 'reasoning-start': {
        const id = `${messageId}-reasoning-${reasoningCount++}`
        reasoningIds.set(chunk.id, id)
        yield {
          type: EventType.REASONING_MESSAGE_START,
          messageId: id,
          role: 'reasoning',
        }
        break
      }
      case 'reasoning-delta': {
        const id = reasoningIds.get(chunk.id)
        if (id !== undefined) {
          yield {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: id,
            delta: chunk.delta,
          }
        }
        break
      }
      case 'reasoning-end': {
        const id = reasoningIds.get(chunk.id)
        if (id === undefined) break
        // The provider metadata holds the reasoning signature. The client
        // keeps it as an opaque value and sends it back unchanged.
        if (chunk.providerMetadata !== undefined) {
          yield {
            type: EventType.REASONING_ENCRYPTED_VALUE,
            subtype: 'message',
            entityId: id,
            encryptedValue: JSON.stringify(chunk.providerMetadata),
          }
        }
        yield { type: EventType.REASONING_MESSAGE_END, messageId: id }
        break
      }

      case 'tool-input-start':
        tools.set(chunk.toolCallId, { started: true, hasArgs: false })
        yield {
          type: EventType.TOOL_CALL_START,
          toolCallId: chunk.toolCallId,
          toolCallName: chunk.toolName,
          parentMessageId: messageId,
        }
        break
      case 'tool-input-delta': {
        const tool = tools.get(chunk.toolCallId)
        if (tool) tool.hasArgs = true
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: chunk.toolCallId,
          delta: chunk.inputTextDelta,
        }
        break
      }
      case 'tool-input-available':
        inputs.set(chunk.toolCallId, {
          toolName: chunk.toolName,
          input: chunk.input,
        })
        yield* ensureToolStarted(chunk.toolCallId, chunk.toolName, chunk.input)
        yield { type: EventType.TOOL_CALL_END, toolCallId: chunk.toolCallId }
        break
      case 'tool-approval-request': {
        // `kind: 'approval'` shows the approval on the tool call.
        const call = inputs.get(chunk.toolCallId)
        const descriptor: Interrupt = {
          id: chunk.approvalId,
          reason: 'tool_call',
          toolCallId: chunk.toolCallId,
          metadata: { kind: 'approval', ...call },
        }
        const tool = clientTools?.find((t) => t.name === call?.toolName)
        if (call && tool?.needsApproval === true) {
          // The binding chat() makes. The client accepts it only when the
          // schema hashes match its own copy of the tool.
          const schema = normalizeApprovalSchema(
            tool.approvalSchema,
            tool.inputSchema,
          )
          approvals.push(
            withInterruptBinding(
              { ...descriptor, responseSchema: schema.responseSchema },
              {
                v: INTERRUPT_BINDING_VERSION,
                kind: 'tool-approval',
                interruptId: chunk.approvalId,
                toolName: call.toolName,
                toolCallId: chunk.toolCallId,
                originalArgs: call.input,
                inputSchemaHash: hashSchemaInput(tool.inputSchema),
                approvalSchemaHash: schema.approvalSchemaHash,
                responseSchemaHash: schema.responseSchemaHash,
                interruptedRunId: runId,
                generation: 0,
              },
            ),
          )
          break
        }
        // A generic binding makes the interrupt resolvable without the
        // client's copy of the tool.
        approvals.push(
          withInterruptBinding(descriptor, {
            v: INTERRUPT_BINDING_VERSION,
            kind: 'generic',
            interruptId: chunk.approvalId,
            interruptedRunId: runId,
            generation: 0,
          }),
        )
        break
      }
      case 'tool-output-denied':
        yield toolError(
          chunk.toolCallId,
          'The user denied this tool call',
          'denied',
        )
        break
      case 'tool-input-error':
        yield* ensureToolStarted(chunk.toolCallId, chunk.toolName, chunk.input)
        yield { type: EventType.TOOL_CALL_END, toolCallId: chunk.toolCallId }
        yield toolError(chunk.toolCallId, chunk.errorText)
        break
      case 'tool-output-available':
        // A preliminary output is a progress update. Only the last one is the result.
        if (chunk.preliminary === true) break
        yield {
          type: EventType.TOOL_CALL_RESULT,
          messageId: `${chunk.toolCallId}-result`,
          toolCallId: chunk.toolCallId,
          content:
            typeof chunk.output === 'string'
              ? chunk.output
              : JSON.stringify(chunk.output ?? null),
          role: 'tool',
        }
        break
      case 'tool-output-error':
        yield toolError(chunk.toolCallId, chunk.errorText)
        break

      case 'error':
        ended = true
        yield { type: EventType.RUN_ERROR, message: chunk.errorText }
        break
      case 'abort':
        ended = true
        yield {
          type: EventType.RUN_FINISHED,
          threadId,
          runId,
          outcome: { type: 'cancelled' },
        }
        break
      case 'finish': {
        ended = true
        const finishReason =
          chunk.finishReason === undefined
            ? undefined
            : FROM_AI_SDK_FINISH[chunk.finishReason]
        yield* finished(
          finishReason == null ? undefined : { tanstack: { finishReason } },
        )
        break
      }

      default:
        if (isDataChunk(chunk)) yield dataChunkEvent(chunk)
        break
    }
    if (ended) return
  }

  yield* finished()
}

function toolError(
  toolCallId: string,
  errorText: string,
  toolResultOutcome?: ToolResultOutcome,
): StreamChunk {
  return {
    type: EventType.TOOL_CALL_RESULT,
    messageId: `${toolCallId}-result`,
    toolCallId,
    content: errorText,
    role: 'tool',
    metadata: {
      tanstack: {
        state: 'output-error',
        ...(toolResultOutcome && { toolResultOutcome }),
      },
    },
  }
}
