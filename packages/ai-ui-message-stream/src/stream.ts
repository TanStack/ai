import {
  EventType,
  INTERRUPT_BINDING_VERSION,
  RUN_ACCEPTED_EVENT,
  getProviderExecutedMetadata,
  hashSchemaInput,
  normalizeApprovalSchema,
  readInterruptBinding,
  validateWithStandardSchema,
  withInterruptBinding,
} from '@tanstack/ai'
import type {
  AnyClientTool,
  Interrupt,
  RunFinishedEvent,
  SchemaInput,
  StreamChunk,
  ToolCallStartEvent,
  ToolResultOutcome,
} from '@tanstack/ai'
import type { FinishReason, ProviderMetadata, UIMessageChunk } from 'ai'
import { DataParts, dataChunkEvent, isDataChunk, isRecord } from './data-parts'
import type { AISDKApprovalFields, AISDKToolCallMetadata } from './messages'

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

/** A tool call that `toUIMessageStream` has seen. */
interface ToolCallState {
  name: string
  args: string
  /** `TOOL_CALL_START.metadata`, the TanStack `ToolCallPart.metadata`. */
  metadata?: ToolCallStartEvent['metadata']
}

/**
 * The tool call's TanStack metadata as AI SDK call provider metadata, under
 * `tanstack`. `fromAISDKMessages` reads it back.
 */
function toolCallFields(tool: ToolCallState): {
  providerMetadata?: ProviderMetadata
  providerExecuted?: boolean
} {
  if (tool.metadata === undefined) return {}
  return {
    providerMetadata: { tanstack: tool.metadata },
    ...(getProviderExecutedMetadata(tool) && { providerExecuted: true }),
  }
}

/**
 * Convert the AG-UI event stream of `chat()` into an AI SDK UI message
 * stream. Serve it with the AI SDK's `createUIMessageStreamResponse`, and the
 * AI SDK `useChat` reads it like a `streamText` route.
 *
 * Each model call is one step. Its `RUN_FINISHED` metadata (model, response
 * ids, finish reason) and usage go into the message metadata. A tool call's
 * metadata goes into `providerMetadata.tanstack`. A provider-executed call
 * gets a `providerExecuted` output and a `source-url` part for each source.
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
    const tools = new Map<string, ToolCallState>()
    const signatures = new Map<string, string>()
    const dataParts = new DataParts()
    // Each model call of chat() is one AI SDK step. It ends at RUN_FINISHED.
    let inStep = false
    const usage: Array<NonNullable<RunFinishedEvent['usage']>> = []

    function* start(messageId?: string): Generator<UIMessageChunk> {
      if (started) return
      started = true
      yield messageId === undefined
        ? { type: 'start' }
        : { type: 'start', messageId }
    }

    function* startStep(): Generator<UIMessageChunk> {
      if (inStep) return
      inStep = true
      yield { type: 'start-step' }
    }

    function* finishStep(): Generator<UIMessageChunk> {
      if (!inStep) return
      inStep = false
      yield { type: 'finish-step' }
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
          yield* startStep()
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
          yield* startStep()
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
          // A tool call's signature (Gemini `thoughtSignature`) joins its
          // metadata, as the TanStack client stores it. It goes out on
          // `tool-input-available`.
          if (event.subtype === 'tool-call') {
            const tool = tools.get(event.entityId)
            if (tool) {
              tool.metadata = {
                ...tool.metadata,
                thoughtSignature: event.encryptedValue,
              }
            }
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

        case EventType.TOOL_CALL_START: {
          yield* start(event.parentMessageId)
          yield* startStep()
          const tool: ToolCallState = {
            name: event.toolCallName,
            args: '',
            metadata: event.metadata,
          }
          tools.set(event.toolCallId, tool)
          yield {
            type: 'tool-input-start',
            toolCallId: event.toolCallId,
            toolName: event.toolCallName,
            ...toolCallFields(tool),
          }
          break
        }
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
            ...toolCallFields(tool),
          }
          // The provider ran this call and sends no TOOL_CALL_RESULT. The AI
          // SDK client marks it done with a provider-executed output.
          const executed = getProviderExecutedMetadata(tool)
          if (executed) {
            yield {
              type: 'tool-output-available',
              toolCallId: event.toolCallId,
              output: executed.sources ?? null,
              providerExecuted: true,
            }
            for (const [index, source] of (executed.sources ?? []).entries()) {
              yield {
                type: 'source-url',
                sourceId: `${event.toolCallId}-source-${index}`,
                url: source.url,
                ...(source.title !== undefined && { title: source.title }),
              }
            }
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
          yield* finishStep()
          // The model call's metadata (model, source, response ids) goes on
          // the message, as the TanStack client keeps it. AI SDK merges each
          // `message-metadata`. `tanstack.tokenUsage` lists each model call's
          // AG-UI usage, under the TanStack key so it cannot clash with an
          // app's own metadata.
          if (event.usage !== undefined) usage.push(event.usage)
          if (event.metadata !== undefined || usage.length > 0) {
            const tanstack = event.metadata?.tanstack
            yield* start()
            yield {
              type: 'message-metadata',
              messageMetadata: {
                ...event.metadata,
                ...(usage.length > 0 && {
                  tanstack: {
                    ...(isRecord(tanstack) && tanstack),
                    tokenUsage: [...usage],
                  },
                }),
              },
            }
          }
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
    yield* finishStep()
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
  /**
   * The schema of the route's `Output.object({ schema })`, as passed to
   * `useChat({ outputSchema })`. The answer text becomes a `structured-output`
   * part with partial objects while it streams. At the end the text is
   * checked against the schema: a valid answer is the part's `data`, and an
   * invalid one ends the run with a RUN_ERROR.
   */
  outputSchema?: SchemaInput
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
 * `approval-responded`. An approval the route made itself (`isAutomatic`)
 * asks nothing.
 *
 * A tool call keeps its AI SDK provider metadata, approval signature and
 * `providerExecuted` flag in its metadata, and the message keeps the AI SDK
 * message metadata as `metadata.aiSdk`, so `toAISDKMessages` sends them back.
 * A provider-executed call is not run on the client. Steps become
 * STEP_STARTED / STEP_FINISHED. Sources, files and citations become CUSTOM
 * events named `source-url`, `source-document`, `file`, `reasoning-file` and
 * `citations`. A `data-<name>` part with an id and object data becomes an
 * activity of type `<name>`. Other data chunks become CUSTOM events named
 * `data-<name>`.
 */
export async function* fromUIMessageStream(
  stream: ReadableStream<UIMessageChunk>,
  {
    threadId,
    runId,
    tools: clientTools,
    outputSchema,
  }: FromUIMessageStreamOptions,
): AsyncGenerator<StreamChunk> {
  let messageId = `${runId}-assistant`
  let ended = false
  // AI SDK reasoning ids are only unique inside one step, so each reasoning
  // part gets its own AG-UI message id.
  const reasoningIds = new Map<string, string>()
  let reasoningCount = 0
  let stepCount = 0
  // `text`: the input streams as raw text, not JSON, so only the final input
  // becomes the arguments.
  const tools = new Map<
    string,
    { hasArgs: boolean; text: boolean; ended?: boolean }
  >()
  // TOOL_CALL_END waits for the next chunk. An approval request or an output
  // for the same call can still add metadata, and AG-UI allows no
  // TOOL_CALL_ARGS after TOOL_CALL_END.
  const pendingEnds = new Set<string>()
  const toolMetadata = new Map<string, AISDKToolCallMetadata>()
  const inputs = new Map<string, { toolName: string; input: unknown }>()
  const approvals: Array<Interrupt> = []
  // ponytail: shallow merge, where the AI SDK merges nested objects too.
  let messageMetadata: unknown
  // The answer text, once text starts with `outputSchema` set.
  // ponytail: all text of the stream is the answer, so text in a tool-call
  // step joins it. Start the answer per step if a route sends such text.
  let structuredRaw: string | undefined

  /**
   * `structured-output.complete` with the checked answer, or a RUN_ERROR
   * when the text is not JSON or fails the schema.
   */
  async function structuredEnd(): Promise<StreamChunk | undefined> {
    if (structuredRaw === undefined) return undefined
    const object = parseJson(structuredRaw)
    const result =
      object === undefined
        ? undefined
        : await validateWithStandardSchema(outputSchema, object)
    if (result?.success) {
      return {
        type: EventType.CUSTOM,
        name: 'structured-output.complete',
        value: { object: result.data, raw: structuredRaw, messageId },
      }
    }
    return {
      type: EventType.RUN_ERROR,
      code: 'structured-output-validation-failed',
      message:
        result === undefined
          ? 'The structured output is not valid JSON'
          : `The structured output does not match the schema: ${result.issues
              .map((issue) => issue.message)
              .join(', ')}`,
    }
  }

  function mergeMessageMetadata(value: unknown) {
    if (value === undefined) return
    messageMetadata =
      isRecord(messageMetadata) && isRecord(value)
        ? { ...messageMetadata, ...value }
        : value
  }

  /** RUN_FINISHED metadata. The client merges it into the run's messages. */
  function runMetadata(
    tanstack?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (tanstack === undefined && messageMetadata === undefined)
      return undefined
    return {
      ...(tanstack && { tanstack }),
      ...(messageMetadata !== undefined && { aiSdk: messageMetadata }),
    }
  }

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

  /**
   * Add AI SDK fields to a tool call's metadata. The TanStack client keeps
   * the metadata of TOOL_CALL_START and TOOL_CALL_ARGS on the tool-call
   * part, so a started call gets the update on an empty TOOL_CALL_ARGS. The
   * client replaces the `aiSdk` key, so each update carries all of it.
   */
  function* updateToolMetadata(
    toolCallId: string,
    providerExecuted: boolean | undefined,
    aiSdk: NonNullable<AISDKToolCallMetadata['aiSdk']>,
  ): Generator<StreamChunk> {
    const current = toolMetadata.get(toolCallId)
    const next: AISDKToolCallMetadata = {
      ...current,
      ...(providerExecuted === true && { providerExecuted: true }),
      aiSdk: { ...current?.aiSdk, ...aiSdk },
    }
    toolMetadata.set(toolCallId, next)
    // A started call takes the update until it ends. After the end the
    // update stays off the stream.
    const tool = tools.get(toolCallId)
    if (tool && !tool.ended) {
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: '',
        metadata: next,
      }
    }
  }

  /** The call metadata of a tool chunk, when it has any. */
  function* callMetadata(chunk: {
    toolCallId: string
    providerExecuted?: boolean
    providerMetadata?: ProviderMetadata
  }): Generator<StreamChunk> {
    if (chunk.providerExecuted !== true && chunk.providerMetadata === undefined)
      return
    yield* updateToolMetadata(
      chunk.toolCallId,
      chunk.providerExecuted,
      chunk.providerMetadata === undefined
        ? {}
        : { callProviderMetadata: chunk.providerMetadata },
    )
  }

  /** The result metadata of a tool chunk, for a call started in this stream. */
  function* resultMetadata(chunk: {
    toolCallId: string
    providerMetadata?: ProviderMetadata
  }): Generator<StreamChunk> {
    if (chunk.providerMetadata === undefined || !tools.has(chunk.toolCallId))
      return
    yield* updateToolMetadata(chunk.toolCallId, undefined, {
      resultProviderMetadata: chunk.providerMetadata,
    })
  }

  /** End one waiting call, or every waiting call except `keep`. */
  function* endTools(only?: string, keep?: string): Generator<StreamChunk> {
    for (const toolCallId of only === undefined ? [...pendingEnds] : [only]) {
      if (toolCallId === keep || !pendingEnds.delete(toolCallId)) continue
      const tool = tools.get(toolCallId)
      if (tool) tool.ended = true
      yield { type: EventType.TOOL_CALL_END, toolCallId }
    }
  }

  function* ensureToolStarted(
    toolCallId: string,
    toolName: string,
    input: unknown,
  ): Generator<StreamChunk> {
    let tool = tools.get(toolCallId)
    if (!tool) {
      tool = { hasArgs: false, text: false }
      tools.set(toolCallId, tool)
      const metadata = toolMetadata.get(toolCallId)
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: toolName,
        parentMessageId: messageId,
        ...(metadata && { metadata }),
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
    yield* endTools(
      undefined,
      'toolCallId' in chunk ? chunk.toolCallId : undefined,
    )
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- reset-step and custom parts are skipped; default maps data parts.
    switch (chunk.type) {
      case 'start':
        if (chunk.messageId !== undefined) messageId = chunk.messageId
        mergeMessageMetadata(chunk.messageMetadata)
        break
      case 'message-metadata':
        mergeMessageMetadata(chunk.messageMetadata)
        break

      case 'start-step':
        yield { type: EventType.STEP_STARTED, stepName: `step-${++stepCount}` }
        break
      case 'finish-step':
        yield { type: EventType.STEP_FINISHED, stepName: `step-${stepCount}` }
        break

      // No TanStack part holds these. The app reads them in `onCustomEvent`.
      case 'source-url':
      case 'source-document':
      case 'file':
      case 'reasoning-file': {
        const { type, ...value } = chunk
        yield { type: EventType.CUSTOM, name: type, value }
        break
      }

      // Every AI SDK text part belongs to the one assistant message. The
      // TanStack client starts a new text segment on each START.
      case 'text-start':
        // The TanStack client puts the text after this event in a
        // `structured-output` part, as for `chat({ outputSchema })`.
        if (outputSchema !== undefined && structuredRaw === undefined) {
          structuredRaw = ''
          yield {
            type: EventType.CUSTOM,
            name: 'structured-output.start',
            value: { messageId },
          }
        }
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        }
        break
      case 'text-delta':
        if (structuredRaw !== undefined) structuredRaw += chunk.delta
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: chunk.delta,
        }
        break
      case 'text-end':
        yield { type: EventType.TEXT_MESSAGE_END, messageId }
        if (chunk.citations !== undefined) {
          yield {
            type: EventType.CUSTOM,
            name: 'citations',
            value: chunk.citations,
          }
        }
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

      case 'tool-input-start': {
        yield* callMetadata(chunk)
        const metadata = toolMetadata.get(chunk.toolCallId)
        tools.set(chunk.toolCallId, {
          hasArgs: false,
          text: chunk.inputEncoding === 'text',
        })
        yield {
          type: EventType.TOOL_CALL_START,
          toolCallId: chunk.toolCallId,
          toolCallName: chunk.toolName,
          parentMessageId: messageId,
          ...(metadata && { metadata }),
        }
        break
      }
      case 'tool-input-delta': {
        const tool = tools.get(chunk.toolCallId)
        if (tool?.text) break
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
        yield* callMetadata(chunk)
        yield* ensureToolStarted(chunk.toolCallId, chunk.toolName, chunk.input)
        pendingEnds.add(chunk.toolCallId)
        break
      case 'tool-approval-request': {
        // The route approved or denied the call itself. The output or the
        // denial follows, so there is nothing to ask.
        if (chunk.isAutomatic === true) break
        // The tool part keeps the fields the AI SDK route checks on the answer.
        const approval: AISDKApprovalFields = {
          ...(chunk.approvalDescriptor != null && {
            descriptor: chunk.approvalDescriptor,
          }),
          ...(Object.hasOwn(chunk, 'inputSchemaInput') && {
            inputSchemaInput: chunk.inputSchemaInput,
          }),
          ...(chunk.reason != null && { requestReason: chunk.reason }),
          ...(chunk.signature != null && { signature: chunk.signature }),
        }
        if (Object.keys(approval).length > 0)
          yield* updateToolMetadata(chunk.toolCallId, undefined, { approval })
        yield* endTools(chunk.toolCallId)
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
        yield* endTools(chunk.toolCallId)
        yield toolError(
          chunk.toolCallId,
          'The user denied this tool call',
          'denied',
        )
        break
      case 'tool-input-error':
        yield* callMetadata(chunk)
        yield* ensureToolStarted(chunk.toolCallId, chunk.toolName, chunk.input)
        yield { type: EventType.TOOL_CALL_END, toolCallId: chunk.toolCallId }
        yield toolError(chunk.toolCallId, chunk.errorText)
        break
      case 'tool-output-available':
        // A preliminary output is a progress update. Only the last one is the result.
        if (chunk.preliminary === true) break
        yield* resultMetadata(chunk)
        yield* endTools(chunk.toolCallId)
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
        yield* resultMetadata(chunk)
        yield* endTools(chunk.toolCallId)
        yield toolError(chunk.toolCallId, chunk.errorText)
        break

      case 'error':
        ended = true
        yield { type: EventType.RUN_ERROR, message: chunk.errorText }
        break
      case 'abort': {
        ended = true
        const metadata = runMetadata()
        yield {
          type: EventType.RUN_FINISHED,
          threadId,
          runId,
          outcome: { type: 'cancelled' },
          ...(metadata && { metadata }),
        }
        break
      }
      case 'finish': {
        ended = true
        mergeMessageMetadata(chunk.messageMetadata)
        const finishReason =
          chunk.finishReason === undefined
            ? undefined
            : FROM_AI_SDK_FINISH[chunk.finishReason]
        const end = await structuredEnd()
        if (end) yield end
        if (end?.type === EventType.RUN_ERROR) return
        yield* finished(
          runMetadata(finishReason == null ? undefined : { finishReason }),
        )
        break
      }

      default:
        if (isDataChunk(chunk)) yield dataChunkEvent(chunk)
        break
    }
    if (ended) return
  }

  yield* endTools()
  const end = await structuredEnd()
  if (end) yield end
  if (end?.type === EventType.RUN_ERROR) return
  yield* finished(runMetadata())
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
