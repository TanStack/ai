import {
  StreamProcessor,
  convertSchemaToJsonSchema,
  generateMessageId,
  isStandardSchema,
  normalizeToUIMessage,
  parseWithStandardSchema,
} from '@tanstack/ai/client'
import { createNoOpChatDevtoolsBridge } from './devtools-noop'
import {
  fetcherToConnectionAdapter,
  getChunkRunId,
  normalizeConnectionAdapter,
} from './connection-adapters'
import { ChatPersistor } from './client-persistor'
import { ClearedStreamTracker } from './cleared-stream-tracker'
import { InterruptManager } from './interrupt-manager'
import type {
  AnyClientTool,
  ContentPart,
  InterruptSubmissionError,
  ModelMessage,
  RunAgentResumeItem,
  StreamChunk,
} from '@tanstack/ai/client'
import type {
  ConnectionAdapter,
  SubscribeConnectionAdapter,
} from './connection-adapters'
import type {
  ChatClientEventEmitter,
  ChatClientRunEventContext,
} from './events'
import type {
  AIDevtoolsChatSnapshot,
  ChatDevtoolsBridge,
  ChatDevtoolsBridgeOptions,
} from './devtools'
import type {
  BoundInterrupts,
  ChatClientOptions,
  ChatClientState,
  ChatFetcher,
  ChatInterrupt,
  ChatInterruptState,
  ChatPendingInterrupt,
  ChatResumeSnapshot,
  ChatResumeState,
  ConnectionStatus,
  MessagePart,
  MultimodalContent,
  QueueBusyReason,
  QueueOption,
  QueueStrategy,
  QueuedMessage,
  SendMessageOptions,
  ToolCallPart,
  UIMessage,
  WhenBusy,
} from './types'
import type { InterruptManagerSubmission } from './interrupt-manager'

/** Internal queue entry — public {@link QueuedMessage} plus optional per-send body. */
interface InternalQueuedMessage extends QueuedMessage {
  body?: Record<string, any>
}

type ChatClientUpdateOptionsWithoutContext<
  TTools extends ReadonlyArray<AnyClientTool>,
> = {
  connection?: ConnectionAdapter
  fetcher?: ChatFetcher
  /** @deprecated Use `forwardedProps` instead. */
  body?: Record<string, any>
  forwardedProps?: Record<string, any>
  tools?: TTools
  queue?: QueueOption
  onResponse?: (response?: Response) => void | Promise<void>
  onChunk?: (chunk: StreamChunk) => void
  onFinish?: (message: UIMessage) => void
  onError?: (error: Error) => void
  onSubscriptionChange?: (isSubscribed: boolean) => void
  onConnectionStatusChange?: (status: ConnectionStatus) => void
  onSessionGeneratingChange?: (isGenerating: boolean) => void
  onQueueChange?: (queue: Array<QueuedMessage>) => void
  onResumeStateChange?: (
    resumeState: ChatResumeState | null,
    pendingInterrupts: BoundInterrupts<TTools>,
  ) => void
  onInterruptStateChange?: (state: ChatInterruptState<TTools>) => void
  onCustomEvent?: (
    eventType: string,
    data: unknown,
    context: { toolCallId?: string },
  ) => void
}

type ClientToolResult = {
  toolCallId: string
  tool: string
  output: any
  state?: 'output-available' | 'output-error'
  errorText?: string
}

function resolveTransport(transport: {
  connection?: ConnectionAdapter
  fetcher?: ChatFetcher
}): ConnectionAdapter {
  const { connection, fetcher } = transport
  if (connection && fetcher) {
    throw new Error(
      'ChatClient: pass either `connection` or `fetcher`, not both.',
    )
  }
  if (connection) return connection
  if (fetcher) return fetcherToConnectionAdapter(fetcher)
  throw new Error('ChatClient: either `connection` or `fetcher` is required.')
}

export interface NormalizedQueueConfig {
  whenBusy: WhenBusy
  drain: 'fifo' | 'batch'
  onOverflow: 'reject' | 'drop-oldest'
  maxSize?: number
  strategy?: QueueStrategy
}

export function normalizeQueueOption(
  option: QueueOption | undefined,
): NormalizedQueueConfig {
  const base: NormalizedQueueConfig = {
    whenBusy: 'queue',
    drain: 'fifo',
    onOverflow: 'reject',
  }
  if (!option) return base
  if (typeof option === 'string') return { ...base, whenBusy: option }
  if (typeof option === 'function') return { ...base, strategy: option }

  const maxSize = option.maxSize
  if (maxSize !== undefined) {
    if (!Number.isInteger(maxSize) || maxSize < 0) {
      throw new Error(
        'ChatClient: queue.maxSize must be a non-negative integer',
      )
    }
  }

  return {
    whenBusy: option.whenBusy ?? 'queue',
    drain: option.drain ?? 'fifo',
    onOverflow: option.onOverflow ?? 'reject',
    ...(maxSize !== undefined ? { maxSize } : {}),
  }
}

/**
 * Merge a run of queued messages into a single send for `drain: 'batch'`.
 * All-string content is joined with newlines; mixed/multimodal content is
 * flattened into a single `ContentPart` array. The last item's `body` wins.
 */
function mergeQueuedMessages(items: Array<InternalQueuedMessage>): {
  content: string | MultimodalContent
  body?: Record<string, any>
} {
  const body = items.at(-1)?.body
  const stringContents: Array<string> = []
  for (const item of items) {
    if (typeof item.content !== 'string') {
      break
    }
    stringContents.push(item.content)
  }
  if (stringContents.length === items.length) {
    return {
      content: stringContents.join('\n'),
      ...(body !== undefined ? { body } : {}),
    }
  }
  const parts: Array<ContentPart> = []
  for (const item of items) {
    if (typeof item.content === 'string') {
      parts.push({ type: 'text', content: item.content })
    } else if (typeof item.content.content === 'string') {
      parts.push({ type: 'text', content: item.content.content })
    } else {
      parts.push(...item.content.content)
    }
  }
  return {
    content: { content: parts },
    ...(body !== undefined ? { body } : {}),
  }
}

/**
 * Extract a boolean approval decision from an AG-UI resume payload, if present.
 * Tool-approval resolutions carry `{ approved: boolean, ... }`; generic
 * interrupt payloads do not.
 */
function readApprovalApproved(payload: unknown): boolean | undefined {
  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return undefined
  }
  if (!('approved' in payload) || typeof payload.approved !== 'boolean') {
    return undefined
  }
  return payload.approved
}

function readResumeState(
  snapshot: ChatResumeSnapshot,
): ChatResumeState | undefined {
  const value: unknown = snapshot
  if (
    value === null ||
    typeof value !== 'object' ||
    !('resumeState' in value)
  ) {
    return undefined
  }
  const resumeState = value.resumeState
  if (
    resumeState === null ||
    typeof resumeState !== 'object' ||
    !('threadId' in resumeState) ||
    typeof resumeState.threadId !== 'string' ||
    resumeState.threadId.length === 0 ||
    !('runId' in resumeState) ||
    typeof resumeState.runId !== 'string' ||
    resumeState.runId.length === 0
  ) {
    return undefined
  }
  return { threadId: resumeState.threadId, runId: resumeState.runId }
}

export class ChatClient<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = unknown,
> {
  private readonly processor: StreamProcessor
  private connection: SubscribeConnectionAdapter
  private readonly uniqueId: string
  private readonly threadId: string
  // Durable chat persistence (optional): messages + resume snapshot as one
  // combined record, so a full page reload restores the transcript, rehydrates
  // pending interrupts, and rejoins an in-flight run. Clear-during-stream
  // suppression is always on via ClearedStreamTracker so `clear()` works
  // without a storage adapter.
  private readonly persistor?: ChatPersistor
  private readonly clearedStreamTracker = new ClearedStreamTracker()
  private currentRunId: string | null = null
  // Interrupt-resume tracking: the run/thread of the most recent interrupted
  // run, so approvals/client-tool results can be sent back. Cleared when the
  // run terminates. This is STATE (interrupt) resume, not delivery/cursor.
  private lastResume: ChatResumeState | null = null
  private readonly interruptManager: InterruptManager<TTools>
  private activeInterruptSubmission: InterruptManagerSubmission | undefined
  private interruptSubmissionFailure:
    | { errors: ReadonlyArray<InterruptSubmissionError> }
    | undefined
  private readonly joinedRunWaiters = new Map<string, () => void>()
  // When set, the next streamResponse() continues this interrupted run instead
  // of starting a fresh run (consumed once).
  private pendingResumeParentRunId: string | null = null
  private pendingResumeThreadId: string | null = null
  private pendingResumeItems: Array<RunAgentResumeItem> | null = null
  private activeResumeThreadId: string | null = null
  private activeResumeRunId: string | null = null
  // Track the legacy `body` option and the canonical `forwardedProps`
  // option as separate slots so that `updateOptions({ forwardedProps })`
  // doesn't wipe a previously-set `body` (and vice versa). They are
  // merged on every send, with `forwardedProps` winning on key collision.
  private bodyOption: Record<string, any> = {}
  private forwardedPropsOption: Record<string, any> = {}
  private context: TContext | undefined = undefined
  private pendingMessageBody: Record<string, any> | undefined = undefined
  private queueConfig: NormalizedQueueConfig
  private messageQueue: Array<InternalQueuedMessage> = []
  /**
   * True from the moment `sendMessage` claims the client until its
   * `streamResponse` settles. Closes the race where concurrent callers both
   * see `isLoading === false`, both append a user message, and only one stream
   * actually runs (leaving stranded user messages with no reply).
   */
  private sendInFlight = false
  /**
   * True while `drainQueue` is delivering queued messages. Concurrent
   * `sendMessage` calls during a drain are treated as busy and follow
   * `whenBusy` (default: queue).
   */
  private messageQueueDraining = false
  /**
   * Set by `whenBusy: 'interrupt'` so an in-progress FIFO drain loop stops
   * before starting the next queued item (the interrupting send owns the client).
   */
  private stopMessageQueueDrain = false
  /**
   * Sync claim held for the duration of `deliverMessage` so concurrent
   * deliverers cannot both append a user message before only one stream runs.
   */
  private deliverClaim = false
  private isLoading = false
  private isSubscribed = false
  private error: Error | undefined = undefined
  private status: ChatClientState = 'ready'
  private connectionStatus: ConnectionStatus = 'disconnected'
  private abortController: AbortController | null = null
  private readonly clientToolsRef: { current: Map<string, AnyClientTool> }
  private readonly devtoolsBridge: ChatDevtoolsBridge
  /**
   * Alias for `this.events`. The bridge installs an
   * emitter that auto-attaches run/thread context and auto-emits a
   * snapshot after every event, so chat-client only ever calls
   * `this.events.X(...)` exactly like it did before devtools landed.
   */
  private readonly events: ChatClientEventEmitter
  private currentStreamId: string | null = null
  private currentMessageId: string | null = null
  private readonly postStreamActions: Array<() => Promise<void>> = []
  // Track pending client tool executions to await them before stream finalization
  private readonly pendingToolExecutions: Map<string, Promise<void>> = new Map()
  private activeClientTools: Map<string, AnyClientTool> | null = null
  private activeContext: TContext | undefined = undefined
  // Flag to deduplicate continuation checks during action draining
  private continuationPending = false
  private subscriptionAbortController: AbortController | null = null
  private processingResolve: (() => void) | null = null
  private errorReportedGeneration: number | null = null
  private streamGeneration = 0
  // Tracks whether a queued checkForContinuation was skipped because
  // continuationPending was true (chained approval scenario)
  private continuationSkipped = false
  private draining = false
  private sessionGenerating = false
  private readonly activeRunIds = new Set<string>()
  private devtoolsMounted = false

  private readonly callbacksRef: {
    current: {
      onResponse: (response?: Response) => void | Promise<void>
      onChunk: (chunk: StreamChunk) => void
      onFinish: (message: UIMessage) => void
      onError: (error: Error) => void
      onMessagesChange: (messages: Array<UIMessage>) => void
      onLoadingChange: (isLoading: boolean) => void
      onErrorChange: (error: Error | undefined) => void
      onStatusChange: (status: ChatClientState) => void
      onSubscriptionChange: (isSubscribed: boolean) => void
      onConnectionStatusChange: (status: ConnectionStatus) => void
      onSessionGeneratingChange: (isGenerating: boolean) => void
      onQueueChange: (queue: Array<QueuedMessage>) => void
      onResumeStateChange: (
        resumeState: ChatResumeState | null,
        pendingInterrupts: BoundInterrupts<TTools>,
      ) => void
      onInterruptStateChange: (state: ChatInterruptState<TTools>) => void
      onCustomEvent: (
        eventType: string,
        data: unknown,
        context: { toolCallId?: string },
      ) => void
    }
  }

  constructor(options: ChatClientOptions<TTools, TContext>) {
    this.uniqueId = options.id || this.generateUniqueId('chat')
    this.threadId = options.threadId || this.generateUniqueId('thread')
    if (options.persistence) {
      // The `persistence` option is either a bare adapter (store everything) or
      // `{ store, messages }`. `messages: false` caches only the resume pointer,
      // leaving the transcript off the client (server-authoritative history).
      const store =
        'store' in options.persistence
          ? options.persistence.store
          : options.persistence
      const storeMessages =
        'store' in options.persistence
          ? options.persistence.messages !== false
          : true
      this.persistor = new ChatPersistor(
        store,
        this.uniqueId,
        (messages) => this.processor.setMessages(messages),
        (snapshot) => this.applyResumeSnapshot(snapshot),
        storeMessages,
      )
    }
    // Both `body` (deprecated) and `forwardedProps` populate the AG-UI
    // `RunAgentInput.forwardedProps` wire field. They are stored
    // separately so `updateOptions` can replace one without touching the
    // other; the merge happens at send time, with `forwardedProps`
    // winning on key collision.
    this.bodyOption = options.body || {}
    this.forwardedPropsOption = options.forwardedProps || {}
    this.context = options.context
    this.queueConfig = normalizeQueueOption(options.queue)
    this.connection = normalizeConnectionAdapter(resolveTransport(options))

    // Build client tools map
    this.clientToolsRef = { current: new Map() }
    if (options.tools) {
      for (const tool of options.tools) {
        this.clientToolsRef.current.set(tool.name, tool)
      }
    }

    this.devtoolsBridge = (
      options.devtoolsBridgeFactory ?? createNoOpChatDevtoolsBridge
    )(this.buildDevtoolsBridgeOptions(options.devtools))
    this.events = this.devtoolsBridge.events

    this.callbacksRef = {
      current: {
        onResponse: options.onResponse || (() => {}),
        onChunk: options.onChunk || (() => {}),
        onFinish: options.onFinish || (() => {}),
        onError: options.onError || (() => {}),
        onMessagesChange: options.onMessagesChange || (() => {}),
        onLoadingChange: options.onLoadingChange || (() => {}),
        onErrorChange: options.onErrorChange || (() => {}),
        onStatusChange: options.onStatusChange || (() => {}),
        onSubscriptionChange: options.onSubscriptionChange || (() => {}),
        onConnectionStatusChange:
          options.onConnectionStatusChange || (() => {}),
        onSessionGeneratingChange:
          options.onSessionGeneratingChange || (() => {}),
        onQueueChange: options.onQueueChange || (() => {}),
        onResumeStateChange: options.onResumeStateChange || (() => {}),
        onInterruptStateChange: options.onInterruptStateChange || (() => {}),
        onCustomEvent: options.onCustomEvent || (() => {}),
      },
    }

    this.interruptManager = new InterruptManager({
      ...(options.tools !== undefined ? { tools: options.tools } : {}),
      submit: (submission) => this.submitInterruptBatch(submission),
      onChange: () => this.notifyResumeStateChange(),
    })

    // In-memory rehydrate of interrupt descriptors (e.g. after a page reload
    // when the host supplies a snapshot). Durable storage of that snapshot is
    // a persistence-stack concern — not wired here.
    if (options.initialResumeSnapshot) {
      this.applyResumeSnapshot(options.initialResumeSnapshot)
    }

    // Create StreamProcessor with event handlers.
    // Use conditional spreads so we don't pass `undefined` into
    // `StreamProcessorOptions` fields under `exactOptionalPropertyTypes`.
    const persistedState = this.persistor?.readInitial()
    const syncPersistedState =
      persistedState instanceof Promise ? undefined : persistedState
    const initialMessages = syncPersistedState
      ? syncPersistedState.messages
      : options.initialMessages
    // A durable snapshot read synchronously from storage wins over the
    // in-memory `initialResumeSnapshot` fallback applied above. A snapshot with
    // pending interrupts rehydrates the interrupt UI; a bare in-flight run is
    // rejoined after the processor is ready (see `rejoinRunId` below).
    let rejoinRunId: string | null = null
    if (syncPersistedState?.resume) {
      const snapshot = syncPersistedState.resume
      const hasPendingInterrupts =
        Array.isArray(snapshot.pendingInterrupts) &&
        snapshot.pendingInterrupts.length > 0
      if (hasPendingInterrupts) {
        this.applyResumeSnapshot(snapshot)
      } else if (snapshot.resumeState.runId) {
        rejoinRunId = snapshot.resumeState.runId
      }
    }

    this.processor = new StreamProcessor({
      ...(options.streamProcessor?.chunkStrategy
        ? { chunkStrategy: options.streamProcessor.chunkStrategy }
        : {}),
      ...(initialMessages ? { initialMessages } : {}),
      events: {
        onMessagesChange: (messages: Array<UIMessage>) => {
          this.persistor?.notifyMessagesChanged(messages)
          this.callbacksRef.current.onMessagesChange(messages)
        },
        onStreamStart: () => {
          this.setStatus('streaming')
          const assistantMessageId =
            this.processor.getCurrentAssistantMessageId()
          if (!assistantMessageId) {
            return
          }
          const messages = this.processor.getMessages()
          const assistantMessage = messages.find(
            (m: UIMessage) => m.id === assistantMessageId,
          )
          if (assistantMessage) {
            this.currentMessageId = assistantMessage.id
            this.events.messageAppended(
              assistantMessage,
              this.currentStreamId || undefined,
            )
          }
        },
        onStreamEnd: (message: UIMessage) => {
          this.callbacksRef.current.onFinish(message)
          this.setStatus('ready')
          // Resolve the processing-complete promise so streamResponse can continue
          this.resolveProcessing()
        },
        onError: (error: Error) => {
          this.reportStreamError(error)
        },
        onTextUpdate: (messageId: string, content: string) => {
          // Emit text update to devtools
          if (this.currentStreamId) {
            this.events.textUpdated(this.currentStreamId, messageId, content)
          }
        },
        onThinkingUpdate: (messageId: string, content: string) => {
          // Emit thinking update to devtools
          if (this.currentStreamId) {
            this.events.thinkingUpdated(
              this.currentStreamId,
              messageId,
              content,
              undefined,
            )
          }
        },
        onStructuredOutputChange: (args) => {
          const streamId = this.devtoolsBridge.resolveStreamId()
          const eventName =
            args.phase === 'start'
              ? 'structured-output:started'
              : args.phase === 'complete'
                ? 'structured-output:completed'
                : args.phase === 'error'
                  ? 'structured-output:errored'
                  : 'structured-output:updated'

          this.currentMessageId = args.messageId
          this.events.structuredOutputChanged(
            eventName,
            streamId,
            args.messageId,
            {
              status: args.status,
              raw: args.raw,
              ...(args.partial !== undefined ? { partial: args.partial } : {}),
              ...(args.data !== undefined ? { data: args.data } : {}),
              ...(args.reasoning !== undefined
                ? { reasoning: args.reasoning }
                : {}),
              ...(args.errorMessage !== undefined
                ? { errorMessage: args.errorMessage }
                : {}),
              ...(args.delta !== undefined ? { delta: args.delta } : {}),
            },
          )
        },
        onToolCallStateChange: (
          messageId: string,
          toolCallId: string,
          state: string,
          args: string,
        ) => {
          // Get the tool name from the messages
          const messages = this.processor.getMessages()
          const message = messages.find((m: UIMessage) => m.id === messageId)
          const toolCallPart = message?.parts.find(
            (p: MessagePart): p is ToolCallPart =>
              p.type === 'tool-call' && p.id === toolCallId,
          )
          const toolName = toolCallPart?.name || 'unknown'

          // Emit tool call state change to devtools
          if (this.currentStreamId) {
            this.events.toolCallStateChanged(
              this.currentStreamId,
              messageId,
              toolCallId,
              toolName,
              state,
              args,
            )
          }
        },
        onToolCall: (args: {
          toolCallId: string
          toolName: string
          input: any
        }) => {
          // Handle client-side tool execution automatically
          const clientTools =
            this.activeClientTools ?? this.clientToolsRef.current
          const clientTool = clientTools.get(args.toolName)
          const executeFunc = clientTool?.execute
          if (executeFunc) {
            // Capture the run context at execution-start so a tool whose
            // result lands AFTER the originating run finishes still reports
            // back against the originating run, not whatever run is
            // current when the result emits.
            const runEventContext =
              this.devtoolsBridge.getCurrentRunEventContext()
            // Create and track the execution promise
            const executionPromise = (async () => {
              try {
                const context =
                  this.activeClientTools === null
                    ? this.context
                    : this.activeContext
                const output = await executeFunc(args.input, {
                  toolCallId: args.toolCallId,
                  context: context as TContext,
                  emitCustomEvent: () => {},
                })
                await this.addToolResultForClientTool(
                  {
                    toolCallId: args.toolCallId,
                    tool: args.toolName,
                    output,
                    state: 'output-available',
                  },
                  clientTool,
                  runEventContext,
                )
              } catch (error: any) {
                await this.addToolResultForClientTool(
                  {
                    toolCallId: args.toolCallId,
                    tool: args.toolName,
                    output: null,
                    state: 'output-error',
                    errorText: error.message,
                  },
                  clientTool,
                  runEventContext,
                )
              } finally {
                // Remove from pending when complete
                this.pendingToolExecutions.delete(args.toolCallId)
              }
            })()

            // Track the pending execution
            this.pendingToolExecutions.set(args.toolCallId, executionPromise)
          }
        },
        onApprovalRequest: (args: {
          toolCallId: string
          toolName: string
          input: any
          approvalId: string
        }) => {
          const streamId = this.devtoolsBridge.resolveStreamId()
          const messageIdForApproval =
            this.findMessageIdForToolCall(args.toolCallId) ??
            this.currentMessageId ??
            ''

          this.events.approvalRequested(
            streamId,
            messageIdForApproval,
            args.toolCallId,
            args.toolName,
            args.input,
            args.approvalId,
          )
        },
        onCustomEvent: (
          eventType: string,
          data: unknown,
          context: { toolCallId?: string },
        ) => {
          this.callbacksRef.current.onCustomEvent(eventType, data, context)
        },
      },
    })

    this.persistor?.hydrateAsync(persistedState)

    // Full page reload with an in-flight run persisted: re-attach to it off the
    // server's delivery-durability log so the stream finishes here. Best-effort
    // and non-blocking; a finished/evicted run just replays or no-ops.
    if (rejoinRunId && this.connection.joinRun) {
      this.resumeInFlightRun(rejoinRunId)
    }
  }

  private applyResumeSnapshot(snapshot: ChatResumeSnapshot): void {
    const resumeState = readResumeState(snapshot)
    if (resumeState === undefined) {
      this.interruptManager.reset()
      return
    }
    this.lastResume = resumeState
    const pendingInterrupts = Array.isArray(snapshot.pendingInterrupts)
      ? snapshot.pendingInterrupts
      : []
    if (pendingInterrupts.length === 0) {
      this.interruptManager.reset()
      return
    }
    const generation = this.interruptGeneration(pendingInterrupts)
    this.interruptManager.hydrate({
      threadId: resumeState.threadId,
      interruptedRunId: resumeState.runId,
      generation,
      interrupts: pendingInterrupts,
    })
  }

  mountDevtools(): void {
    if (this.devtoolsMounted) {
      return
    }

    this.devtoolsMounted = true
    this.devtoolsBridge.mountWithTools(this.processor.getMessages().length)
  }

  /**
   * Drain a runId-less RUN_ERROR that belongs to a cleared run the client is
   * still tracking. The persistor owns the cleared-run bookkeeping; the client
   * owns the active-run / session / processing state.
   */
  private drainIgnoredRunlessChunk(chunk: StreamChunk): void {
    if (chunk.type !== 'RUN_ERROR') return
    const runId = this.clearedStreamTracker.takeRunlessRunId()
    if (!runId) return
    this.activeRunIds.delete(runId)
    this.setSessionGenerating(this.activeRunIds.size > 0)
    this.resolveProcessing()
  }

  private retireIgnoredClearedTerminalChunk(chunk: StreamChunk): void {
    if (chunk.type !== 'RUN_FINISHED' && chunk.type !== 'RUN_ERROR') return
    const runId =
      getChunkRunId(chunk) ?? this.clearedStreamTracker.takeRunlessRunId()
    if (!runId) return
    this.activeRunIds.delete(runId)
    this.setSessionGenerating(this.activeRunIds.size > 0)
    if (!getChunkRunId(chunk)) {
      this.resolveProcessing()
    }
  }

  private updateRunLifecycle(
    chunk: StreamChunk,
    options?: { resolveProcessing?: boolean },
  ): void {
    if (chunk.type === 'RUN_STARTED') {
      const chunkRunId = getChunkRunId(chunk) ?? chunk.runId
      this.activeResumeThreadId =
        'threadId' in chunk && typeof chunk.threadId === 'string'
          ? chunk.threadId
          : this.activeResumeThreadId
      this.activeResumeRunId = chunkRunId
      this.activeRunIds.add(chunkRunId)
      this.clearedStreamTracker.onRunStarted(chunkRunId)
      this.setSessionGenerating(true)
      // Persist a live-run resume snapshot so a full page reload can rejoin this
      // in-flight run via joinRun. Only meaningful when the connection is
      // resumable; skipped otherwise. Interrupt/terminal handling overwrites or
      // clears it in observeInterruptState.
      if (this.persistor && this.connection.joinRun && !this.lastResume) {
        this.persistResumeSnapshot({
          threadId: this.activeResumeThreadId ?? this.threadId,
          runId: chunkRunId,
        })
      }
      return
    }

    if (chunk.type !== 'RUN_FINISHED' && chunk.type !== 'RUN_ERROR') {
      return
    }

    const runId = getChunkRunId(chunk)
    if (runId) {
      this.activeRunIds.delete(runId)
      this.clearedStreamTracker.onRunSettled(runId)
    } else if (chunk.type === 'RUN_ERROR') {
      // RUN_ERROR without runId is a session-level error; clear all runs.
      this.activeRunIds.clear()
      this.clearedStreamTracker.onSessionRunError()
    }
    this.setSessionGenerating(this.activeRunIds.size > 0)
    if (options?.resolveProcessing !== false) {
      this.resolveProcessing()
    }
  }

  /**
   * Track interrupt state off the stream's terminal events. A RUN_FINISHED with
   * an interrupt outcome records the pending interrupts + the run/thread to
   * resume; any other terminal event for the tracked/current run clears that
   * state. This is interrupt (state) resume — there is no delivery cursor.
   */
  private observeInterruptState(chunk: StreamChunk): void {
    if (chunk.type !== 'RUN_FINISHED' && chunk.type !== 'RUN_ERROR') {
      return
    }

    if (this.activeInterruptSubmission && chunk.type === 'RUN_ERROR') {
      return
    }
    const runId = getChunkRunId(chunk)
    const threadId =
      'threadId' in chunk && typeof chunk.threadId === 'string'
        ? chunk.threadId
        : this.activeResumeThreadId

    if (chunk.type === 'RUN_FINISHED' && chunk.outcome?.type === 'interrupt') {
      // Track the REQUEST run id (what the client sent) so a resume targets the
      // same run even when provider events carry their own run id.
      const interruptedRunId =
        this.currentRunId ?? runId ?? this.activeResumeRunId ?? ''
      this.lastResume = {
        threadId: threadId ?? this.threadId,
        runId: interruptedRunId,
      }
      this.interruptManager.hydrate({
        threadId: this.lastResume.threadId,
        interruptedRunId,
        generation: this.interruptGeneration(chunk.outcome.interrupts),
        interrupts: chunk.outcome.interrupts,
      })
      return
    }

    const isRunlessSessionError = chunk.type === 'RUN_ERROR' && !runId
    const isTrackedRunTerminal = Boolean(
      runId && this.lastResume?.runId === runId,
    )
    const isCurrentRunTerminal = Boolean(
      (runId && this.currentRunId === runId) ||
      (this.currentRunId && this.lastResume?.runId === this.currentRunId),
    )
    // Provider adapters sometimes stamp a different run id on continuation
    // events than the client-generated request id. RUN_STARTED updates
    // `activeResumeRunId`, so match that too.
    const isActiveStreamRunTerminal = Boolean(
      this.isLoading &&
      runId &&
      (runId === this.activeResumeRunId || runId === this.currentRunId),
    )
    const isCurrentStreamTerminal =
      this.isLoading && chunk.type === 'RUN_FINISHED' && !runId
    // A resume batch that finishes successfully (or with a non-interrupt
    // terminal) must always clear pending interrupts — even when the provider
    // run id does not correlate. Otherwise Approve works once but the UI
    // keeps showing a stale prompt and blocks follow-up turns.
    const isActiveInterruptSubmissionTerminal = Boolean(
      this.activeInterruptSubmission &&
      this.isLoading &&
      chunk.type === 'RUN_FINISHED' &&
      chunk.outcome?.type !== 'interrupt',
    )
    if (
      isRunlessSessionError ||
      isTrackedRunTerminal ||
      isCurrentRunTerminal ||
      isActiveStreamRunTerminal ||
      isCurrentStreamTerminal ||
      isActiveInterruptSubmissionTerminal
    ) {
      this.lastResume = null
      // Run settled without an interrupt: drop the durable resume snapshot so a
      // later reload does not try to rejoin a finished run.
      this.persistor?.persistResumeSnapshot(null)
      this.interruptManager.reset()
      return
    }
    this.notifyResumeStateChange()
  }

  /**
   * The interrupt-resume state for the active/interrupted run (its run/thread
   * ids), or null when there is nothing to resume. Apps can persist this to
   * resume interrupts across a full reload.
   */
  getResumeState(): ChatResumeState | null {
    return this.lastResume ? { ...this.lastResume } : null
  }

  getInterruptState(): ChatInterruptState<TTools> {
    return this.interruptManager.getState()
  }

  getInterrupts(): BoundInterrupts<TTools> {
    return this.interruptManager.getInterrupts()
  }

  /** @deprecated Use getInterrupts(). */
  getPendingInterrupts(): BoundInterrupts<TTools> {
    return this.interruptManager.getInterrupts()
  }

  resolveInterrupts(approved: boolean): void
  resolveInterrupts(
    resolver: (interrupt: ChatInterrupt<TTools>) => undefined,
  ): void
  resolveInterrupts(
    resolution: boolean | ((interrupt: ChatInterrupt<TTools>) => undefined),
  ): void {
    // Branch so TypeScript can select the InterruptManager.resolve overloads.
    if (typeof resolution === 'boolean') {
      this.interruptManager.resolve(resolution)
      return
    }
    this.interruptManager.resolve(resolution)
  }

  cancelInterrupts(): void {
    this.interruptManager.cancel()
  }

  retryInterrupts(): void {
    this.interruptManager.retry()
  }

  /** Unsafe low-level resume escape hatch. Prefer bound interrupt methods. */
  resumeInterruptsUnsafe(
    resume: Array<RunAgentResumeItem>,
    state?: ChatResumeState,
  ): Promise<boolean> {
    const target = state ?? this.lastResume
    if (!target) return Promise.resolve(false)
    // Auto-executed client tools resolve during the parent stream's
    // `pendingToolExecutions` wait — while `isLoading` is still true.
    // Defer the child continuation until that stream settles so we do not
    // race the parent cleanup or return a false "could not start" failure.
    if (this.isLoading) {
      return new Promise<boolean>((resolve, reject) => {
        this.queuePostStreamAction(async () => {
          try {
            resolve(await this.resumeInterruptsUnsafe(resume, target))
          } catch (error) {
            reject(error)
          }
        })
      })
    }
    this.pendingResumeThreadId = target.threadId
    this.pendingResumeParentRunId = target.runId
    this.pendingResumeItems = [...resume]
    return this.streamResponse()
  }

  /** @deprecated Use bound interrupt methods or resumeInterruptsUnsafe(). */
  resumeInterrupts(
    resume: Array<RunAgentResumeItem>,
    state?: ChatResumeState,
  ): Promise<boolean> {
    return this.resumeInterruptsUnsafe(resume, state)
  }

  private async submitInterruptBatch(
    submission: InterruptManagerSubmission,
  ): Promise<void> {
    this.activeInterruptSubmission = submission
    this.interruptSubmissionFailure = undefined
    // Reflect approval decisions in the local message tree immediately so a
    // follow-up turn does not re-serialize tool-calls still stuck in
    // `approval-requested` (issue #532).
    for (const resolution of submission.resolutions) {
      const approved = readApprovalApproved(resolution.payload)
      if (approved === undefined) continue
      const approvalId = resolution.interruptId
      this.processor.addToolApprovalResponse(approvalId, approved)
    }
    const resumed = await this.resumeInterruptsUnsafe(
      [...submission.resolutions],
      {
        threadId: submission.threadId,
        runId: submission.interruptedRunId,
      },
    ).finally(() => {
      this.activeInterruptSubmission = undefined
    })
    const failure = this.takeInterruptSubmissionFailure()
    if (failure !== undefined) {
      throw { errors: failure.errors }
    }
    if (!resumed) {
      throw new Error('Interrupt continuation could not be started.')
    }
    // Belt-and-suspenders: if the continuation stream finished successfully
    // but correlation failed to clear resume state, drop it now so the next
    // user turn is not blocked by a stale interrupt prompt.
    if (this.lastResume?.runId === submission.interruptedRunId) {
      this.lastResume = null
      this.interruptManager.reset()
    }
  }

  private takeInterruptSubmissionFailure():
    | { errors: ReadonlyArray<InterruptSubmissionError> }
    | undefined {
    const failure = this.interruptSubmissionFailure
    this.interruptSubmissionFailure = undefined
    return failure
  }

  private interruptGeneration(
    interrupts: ReadonlyArray<ChatPendingInterrupt>,
  ): number {
    let generation: number | undefined
    for (const interrupt of interrupts) {
      const candidate: unknown =
        interrupt.metadata?.['tanstack:interruptBinding']
      if (
        candidate === null ||
        typeof candidate !== 'object' ||
        !('generation' in candidate) ||
        typeof candidate.generation !== 'number' ||
        !Number.isInteger(candidate.generation) ||
        candidate.generation < 0
      ) {
        return 0
      }
      if (generation !== undefined && generation !== candidate.generation) {
        return 0
      }
      generation = candidate.generation
    }
    return generation ?? 0
  }

  private generateUniqueId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }

  private setIsLoading(isLoading: boolean): void {
    this.isLoading = isLoading
    this.callbacksRef.current.onLoadingChange(isLoading)
    this.events.loadingChanged(isLoading)
  }

  private setStatus(status: ChatClientState): void {
    this.status = status
    this.callbacksRef.current.onStatusChange(status)
    this.devtoolsBridge.emitSnapshot()
  }

  private setIsSubscribed(isSubscribed: boolean): void {
    this.isSubscribed = isSubscribed
    this.callbacksRef.current.onSubscriptionChange(isSubscribed)
    this.devtoolsBridge.emitSnapshot()
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status
    this.callbacksRef.current.onConnectionStatusChange(status)
    this.devtoolsBridge.emitSnapshot()
  }

  private setSessionGenerating(isGenerating: boolean): void {
    if (this.sessionGenerating === isGenerating) return
    this.sessionGenerating = isGenerating
    this.callbacksRef.current.onSessionGeneratingChange(isGenerating)
    this.devtoolsBridge.emitSnapshot()
  }

  private notifyResumeStateChange(): void {
    const resumeState = this.getResumeState()
    // Persist (or clear) the durable resume snapshot so a full page reload can
    // rehydrate pending interrupts and rejoin the run. Folded into the same
    // persistence adapter that stores messages (one record per chat).
    this.persistResumeSnapshot(resumeState)
    this.callbacksRef.current.onResumeStateChange(
      resumeState,
      this.interruptManager.getInterrupts(),
    )
    this.callbacksRef.current.onInterruptStateChange(
      this.interruptManager.getState(),
    )
  }

  /**
   * Build the durable resume snapshot from the current resume state + pending
   * interrupt descriptors and hand it to the persistor (null clears it).
   */
  private persistResumeSnapshot(resumeState: ChatResumeState | null): void {
    if (!this.persistor) return
    if (!resumeState) {
      this.persistor.persistResumeSnapshot(null)
      return
    }
    const descriptors = this.interruptManager.getDescriptors()
    this.persistor.persistResumeSnapshot({
      schemaVersion: 2,
      resumeState,
      ...(descriptors.length > 0
        ? { pendingInterrupts: [...descriptors] }
        : {}),
    })
  }

  private resetSessionGenerating(options?: {
    preserveClearedStreamTracking?: boolean
  }): void {
    this.activeRunIds.clear()
    if (!options?.preserveClearedStreamTracking) {
      this.clearedStreamTracker.resetActiveRuns()
    }
    this.setSessionGenerating(false)
  }

  private setError(error: Error | undefined): void {
    this.error = error
    this.callbacksRef.current.onErrorChange(error)
    this.events.errorChanged(error?.message || null)
  }

  private buildDevtoolsBridgeOptions(
    devtools: ChatClientOptions['devtools'],
  ): ChatDevtoolsBridgeOptions {
    return {
      hookId: this.uniqueId,
      clientId: this.uniqueId,
      threadId: this.threadId,
      metadata: {
        hookName: devtools?.hookName ?? 'useChat',
        outputKind: devtools?.outputKind ?? 'chat',
        ...(devtools?.framework ? { framework: devtools.framework } : {}),
        ...(devtools?.name ? { name: devtools.name } : {}),
      },
      getSnapshot: () => this.getDevtoolsSnapshot(),
      getTools: () => this.clientToolsRef.current.values(),
      getMessages: () => this.processor.getMessages(),
      setMessages: (messages: Array<UIMessage>) => {
        this.processor.setMessages(messages)
      },
      addToolResult: (toolCallId, output, errorText) => {
        this.processor.addToolResult(toolCallId, output, errorText)
      },
      generateId: (prefix) => this.generateUniqueId(prefix),
    }
  }

  private getDevtoolsSnapshot(): AIDevtoolsChatSnapshot {
    return {
      messages: this.processor.getMessages(),
      status: this.status,
      isLoading: this.isLoading,
      isSubscribed: this.isSubscribed,
      connectionStatus: this.connectionStatus,
      sessionGenerating: this.sessionGenerating,
      activeRunIds: Array.from(this.activeRunIds),
      queue: this.getQueue(),
      ...(this.error ? { error: this.error.message } : {}),
    }
  }

  private findMessageIdForToolCall(toolCallId: string): string | undefined {
    const messages = this.processor.getMessages()
    for (const message of messages) {
      const match = message.parts.find(
        (part: MessagePart): part is ToolCallPart =>
          part.type === 'tool-call' && part.id === toolCallId,
      )
      if (match) return message.id
    }
    return undefined
  }

  private abortSubscriptionLoop(): void {
    this.subscriptionAbortController?.abort()
    this.subscriptionAbortController = null
  }

  private resolveProcessing(): void {
    this.processingResolve?.()
    this.processingResolve = null
  }

  private cancelInFlightStream(options?: {
    setReadyStatus?: boolean
    abortSubscription?: boolean
  }): void {
    this.abortController?.abort()
    this.abortController = null
    if (options?.abortSubscription) {
      this.abortSubscriptionLoop()
    }
    this.resolveProcessing()
    this.setIsLoading(false)
    // Release deliver claim so an interrupting `deliverMessage` can append
    // after abort (the superseded deliver's finally also clears the claim).
    this.deliverClaim = false
    if (options?.setReadyStatus) {
      this.setStatus('ready')
    }
  }

  private reportStreamError(error: Error): void {
    const alreadyReported =
      this.errorReportedGeneration === this.streamGeneration
    this.setError(error)
    // Preserve request-level error semantics even if a RUN_ERROR arrives
    // slightly after loading flips false during stream teardown.
    if (
      this.isLoading ||
      this.status === 'submitted' ||
      this.status === 'streaming'
    ) {
      this.setStatus('error')
    }
    if (!alreadyReported) {
      this.errorReportedGeneration = this.streamGeneration
      this.callbacksRef.current.onError(error)
    }
  }

  /**
   * Start the background subscription loop.
   */
  private startSubscription(): void {
    this.subscriptionAbortController = new AbortController()
    const signal = this.subscriptionAbortController.signal

    this.consumeSubscription(signal)
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          this.setConnectionStatus('error')
          this.resetSessionGenerating()
          this.setIsSubscribed(false)
          this.reportStreamError(err)
        }
        // Resolve pending processing so streamResponse doesn't hang
        this.resolveProcessing()
      })
      .finally(() => {
        // Ignore stale loops that were superseded by a restart.
        if (this.subscriptionAbortController?.signal !== signal) {
          return
        }
        this.subscriptionAbortController = null
        if (!signal.aborted && this.isSubscribed) {
          this.setIsSubscribed(false)
          if (this.connectionStatus !== 'error') {
            this.setConnectionStatus('disconnected')
          }
        }
      })
  }

  /**
   * Consume chunks from the connection subscription.
   */
  private async consumeSubscription(signal: AbortSignal): Promise<void> {
    const stream = this.connection.subscribe(signal)
    for await (const chunk of stream) {
      if (signal.aborted) break
      await this.processIncomingChunk(chunk)
    }
  }

  /**
   * Re-attach to an in-flight run after a full page reload, replaying its
   * stream from the server's delivery-durability log via `joinRun`. Chunks flow
   * through the normal processing path, so the restored (possibly partial)
   * assistant message is updated in place by message id rather than duplicated.
   * Best-effort: a finished, evicted, or unknown run replays to completion or
   * fails quietly, leaving the restored transcript intact.
   */
  private resumeInFlightRun(runId: string): void {
    const joinRun = this.connection.joinRun
    if (!joinRun) return
    const controller = new AbortController()
    this.abortController = controller
    this.currentRunId = runId
    this.setIsLoading(true)
    this.setStatus('streaming')
    void (async () => {
      try {
        for await (const chunk of joinRun(runId, controller.signal)) {
          if (controller.signal.aborted) break
          await this.processIncomingChunk(chunk)
        }
      } catch {
        // Best-effort re-attach: the durable log may be gone or the run
        // unknown. Keep the restored transcript rather than surfacing an error.
      } finally {
        if (this.abortController === controller) {
          this.abortController = null
          this.setIsLoading(false)
          if (this.status === 'streaming') this.setStatus('ready')
        }
      }
    })()
  }

  private async processIncomingChunk(chunk: StreamChunk): Promise<void> {
    if (
      chunk.type === 'RUN_ERROR' &&
      this.isActiveInterruptSubmissionFailure(chunk)
    ) {
      this.interruptSubmissionFailure = {
        errors: chunk['tanstack:interruptErrors'] ?? [],
      }
    }
    if (this.connectionStatus === 'connecting') {
      this.setConnectionStatus('connected')
    }
    const shouldIgnore = this.clearedStreamTracker.shouldIgnoreChunk(chunk)
    if (shouldIgnore) {
      if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
        if (getChunkRunId(chunk)) {
          this.updateRunLifecycle(chunk, { resolveProcessing: false })
        } else {
          this.drainIgnoredRunlessChunk(chunk)
        }
        this.retireIgnoredClearedTerminalChunk(chunk)
        this.resolveJoinedRun(chunk)
      }
      return
    }
    this.callbacksRef.current.onChunk(chunk)
    this.devtoolsBridge.observeChunk(chunk)
    this.processor.processChunk(chunk)
    this.updateRunLifecycle(chunk)
    this.observeInterruptState(chunk)
    await new Promise((resolve) => setTimeout(resolve, 0))
    this.resolveJoinedRun(chunk)
  }

  private isActiveInterruptSubmissionFailure(
    chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
  ): boolean {
    const submission = this.activeInterruptSubmission
    const errors = chunk['tanstack:interruptErrors']
    if (!submission || !errors || errors.length === 0) return false
    const runId = getChunkRunId(chunk)
    if (runId !== undefined && runId !== this.currentRunId) return false
    if (
      typeof chunk.threadId === 'string' &&
      chunk.threadId !== submission.threadId
    ) {
      return false
    }
    return errors.every(
      (error) =>
        error.threadId === submission.threadId &&
        error.interruptedRunId === submission.interruptedRunId &&
        error.generation === submission.generation,
    )
  }

  private resolveJoinedRun(chunk: StreamChunk): void {
    if (chunk.type !== 'RUN_FINISHED' && chunk.type !== 'RUN_ERROR') return
    const runId = getChunkRunId(chunk)
    if (runId === undefined) return
    const resolve = this.joinedRunWaiters.get(runId)
    if (resolve === undefined) return
    this.joinedRunWaiters.delete(runId)
    resolve()
  }

  /**
   * Ensure subscription loop is running, starting it if needed.
   */
  private ensureSubscription(): void {
    if (!this.isSubscribed) {
      this.subscribe()
      return
    }
    if (
      !this.subscriptionAbortController ||
      this.subscriptionAbortController.signal.aborted
    ) {
      this.subscribe({ restart: true })
    }
  }

  /**
   * Create a promise that resolves when onStreamEnd fires.
   * Used by streamResponse to await processing completion.
   */
  private waitForProcessing(): Promise<void> {
    // Resolve any stale promise (e.g., from a previous aborted request)
    this.resolveProcessing()
    return new Promise<void>((resolve) => {
      this.processingResolve = resolve
    })
  }

  /**
   * Send a message and stream the response.
   * Supports both simple string content and multimodal content (images, audio, video, documents).
   *
   * @param content - The message content. Can be:
   *   - A simple string for text-only messages
   *   - A MultimodalContent object with content array and optional custom ID
   * @param body - Optional body parameters to merge with the client's base body for this request.
   *               Uses shallow merge with per-message body taking priority.
   * @param sendOptions - Per-call overrides, e.g. `{ whenBusy: 'interrupt' }` to
   *                      override the configured queue policy for this one send.
   *
   * @example
   * ```ts
   * // Simple text message
   * await client.sendMessage('Hello!')
   *
   * // Text message with custom body params
   * await client.sendMessage('Hello!', { temperature: 0.7 })
   *
   * // Per-call whenBusy override (body must still be the 2nd arg on ChatClient)
   * await client.sendMessage('Urgent', undefined, { whenBusy: 'interrupt' })
   *
   * // Multimodal message with image
   * await client.sendMessage({
   *   content: [
   *     { type: 'text', content: 'What is in this image?' },
   *     { type: 'image', source: { type: 'url', value: 'https://example.com/photo.jpg' } }
   *   ]
   * })
   *
   * // Multimodal message with custom ID and body params
   * await client.sendMessage(
   *   {
   *     content: [
   *       { type: 'text', content: 'Describe this audio' },
   *       { type: 'audio', source: { type: 'data', value: 'base64...' } }
   *     ],
   *     id: 'custom-message-id'
   *   },
   *   { model: 'gpt-5.5' }
   * )
   * ```
   */
  async sendMessage(
    content: string | MultimodalContent,
    body?: Record<string, any>,
    sendOptions?: SendMessageOptions,
  ): Promise<void> {
    this.mountDevtools()
    const emptyMessage = typeof content === 'string' && !content.trim()
    if (emptyMessage) {
      return
    }
    if (this.hasBlockingInterrupts()) {
      throw new Error(
        'ChatClient: cannot send normal input while pending interrupts exist. Use resumeInterrupts() instead.',
      )
    }

    if (this.isSendBusy()) {
      const { action, id } = this.decideWhenBusy(content, sendOptions)
      if (action === 'drop') {
        return
      }
      if (action === 'queue') {
        this.enqueueMessage(content, body, id)
        return
      }
      // 'interrupt': abort the current stream, then send now.
      // Unlike stop(), does not flush already-queued messages — they drain
      // after this interrupting send settles successfully.
      // Claim sendInFlight *before* cancelling so a concurrent send cannot
      // slip in between cancel and the deliver below.
      this.stopMessageQueueDrain = true
      this.sendInFlight = true
      this.cancelInFlightStream({ setReadyStatus: true })
      this.resetSessionGenerating()
    } else {
      this.sendInFlight = true
    }

    try {
      await this.deliverMessage(content, body)
    } finally {
      this.sendInFlight = false
    }
  }

  /**
   * True when the client still has user-actionable interrupts (or is mid
   * resume submission). Staged/submitting items that are already being
   * continued do not block a later turn once the resume stream has cleared
   * resume state.
   */
  private hasBlockingInterrupts(): boolean {
    if (!this.lastResume && !this.activeInterruptSubmission) {
      return false
    }
    if (this.activeInterruptSubmission) {
      return true
    }
    return this.interruptManager
      .getInterrupts()
      .some(
        (item) =>
          item.status === 'pending' ||
          item.status === 'validating' ||
          item.status === 'error' ||
          item.status === 'staged',
      )
  }

  /** True while a stream is active, a send is claiming the client, or the queue is draining. */
  private isSendBusy(): boolean {
    return this.isLoading || this.sendInFlight || this.messageQueueDraining
  }

  private resolveBusyReason(): QueueBusyReason {
    if (this.isLoading) return 'streaming'
    if (this.messageQueueDraining) return 'draining'
    return 'sendInFlight'
  }

  /**
   * Append a user message and run the stream. Used by both direct sends and
   * queue drains — callers are responsible for busy/queue policy.
   *
   * Claims delivery synchronously before appending so concurrent callers
   * cannot both add a user message when only one stream can run.
   */
  private async deliverMessage(
    content: string | MultimodalContent,
    body?: Record<string, any>,
  ): Promise<boolean> {
    if (this.isLoading || this.deliverClaim) {
      return false
    }
    this.deliverClaim = true
    try {
      const normalizedContent = this.normalizeMessageInput(content)
      this.pendingMessageBody = body
      const userMessage = this.processor.addUserMessage(
        normalizedContent.content,
        normalizedContent.id,
      )
      this.events.messageSent(userMessage.id, normalizedContent.content)
      return await this.streamResponse()
    } finally {
      this.deliverClaim = false
    }
  }

  /**
   * Resolve the effective action for a send that arrives while busy.
   * The returned `id` is the id that will be stored if the action is `queue`.
   */
  private decideWhenBusy(
    content: string | MultimodalContent,
    sendOptions?: SendMessageOptions,
  ): { action: WhenBusy; id: string } {
    const id = this.generateUniqueId('queued')
    if (sendOptions?.whenBusy) {
      return { action: sendOptions.whenBusy, id }
    }
    const { strategy, whenBusy } = this.queueConfig
    if (strategy) {
      const { action } = strategy({
        pending: {
          id,
          content,
          createdAt: Date.now(),
        },
        busyReason: this.resolveBusyReason(),
        queued: this.getQueue(),
      })
      return { action, id }
    }
    return { action: whenBusy, id }
  }

  private enqueueMessage(
    content: string | MultimodalContent,
    body?: Record<string, any>,
    id?: string,
  ): void {
    const { maxSize, onOverflow } = this.queueConfig
    if (maxSize !== undefined && this.messageQueue.length >= maxSize) {
      // maxSize 0 is a hard cap (never queue). drop-oldest cannot make room.
      if (onOverflow === 'reject' || maxSize === 0) {
        return
      }
      this.messageQueue.shift() // drop-oldest
    }
    this.messageQueue.push({
      id: id ?? this.generateUniqueId('queued'),
      content,
      createdAt: Date.now(),
      ...(body !== undefined ? { body } : {}),
    })
    this.emitQueueChange()
  }

  /**
   * Normalize the message input to extract content and optional id.
   * Trims string content automatically.
   */
  private normalizeMessageInput(input: string | MultimodalContent): {
    content: string | Array<ContentPart>
    id?: string
  } {
    if (typeof input === 'string') {
      return { content: input.trim() }
    }
    return { content: input.content, id: input.id }
  }

  /**
   * Append a message and stream the response
   */
  async append(message: UIMessage | ModelMessage): Promise<void> {
    this.mountDevtools()
    if (this.hasBlockingInterrupts()) {
      throw new Error(
        'ChatClient: cannot append normal input while pending interrupts exist. Use resumeInterrupts() instead.',
      )
    }
    // Normalize the message to ensure it has id and createdAt
    const normalizedMessage = normalizeToUIMessage(message, generateMessageId)

    // Skip system messages - they're handled via systemPrompts, not UIMessages
    if (normalizedMessage.role === 'system') {
      return
    }

    // Type assertion: after checking for system, we know it's user or assistant
    const uiMessage = normalizedMessage as UIMessage

    // Emit message appended event
    this.events.messageAppended(uiMessage)

    // Add to messages
    const messages = this.processor.getMessages()
    this.processor.setMessages([...messages, uiMessage])
    this.devtoolsBridge.emitSnapshot()

    // If stream is in progress, queue the response for after it ends
    if (this.isLoading) {
      this.queuePostStreamAction(async () => {
        await this.streamResponse()
      })
      return
    }

    await this.streamResponse()
  }

  /**
   * Stream a response from the LLM.
   * Returns true if the stream completed successfully, false on abort or error.
   */
  private async streamResponse(): Promise<boolean> {
    // Guard against concurrent streams - if already loading, skip
    if (this.isLoading) {
      return false
    }

    // Track generation so a superseded stream's cleanup doesn't clobber the new one
    const generation = ++this.streamGeneration
    // Native interrupt continuation is a fresh child run. The interrupted run
    // is carried as parentRunId and the complete resolution batch as resume.
    const resumeThreadId = this.pendingResumeThreadId
    const resumeParentRunId = this.pendingResumeParentRunId
    const resumeItems = this.pendingResumeItems
    this.pendingResumeThreadId = null
    this.pendingResumeParentRunId = null
    this.pendingResumeItems = null
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    this.currentRunId = runId
    this.activeResumeThreadId = resumeThreadId ?? this.threadId
    this.activeResumeRunId = runId

    this.setIsLoading(true)
    // Hand off from deliverClaim to isLoading so nested drain can call
    // deliverMessage after this stream settles (while the outer deliver
    // is still on the stack).
    this.deliverClaim = false
    this.setStatus('submitted')
    this.setError(undefined)
    this.errorReportedGeneration = null
    this.abortController = new AbortController()
    // Capture the signal immediately so that a concurrent stop() or
    // sendMessage() that reassigns this.abortController cannot cause
    // connect() to receive a stale or null signal.
    const signal = this.abortController.signal
    // Reset pending tool executions for the new stream
    this.pendingToolExecutions.clear()
    let streamCompletedSuccessfully = false
    let activeDevtoolsRunId: string | null = null
    let runTerminalEventEmitted = false

    try {
      // Get UIMessages with parts (preserves approval state and client tool results)
      const messages = this.processor.getMessages()
      const clientTools = new Map(this.clientToolsRef.current)
      const runtimeContext = this.context

      // Call onResponse callback
      await this.callbacksRef.current.onResponse()

      // If the stream was cancelled during the onResponse await (e.g. stop()
      // from a callback or unmount, or reload() superseding this stream),
      // bail out before allocating waitForProcessing() — otherwise the
      // resolveProcessing() that ran during cancellation is a no-op and the
      // await processingComplete below would deadlock.
      if (signal.aborted) {
        return false
      }

      // Merge sources for the wire `forwardedProps` field, in priority
      // order (later spreads win):
      //   1. Legacy `body` option (deprecated).
      //   2. Canonical `forwardedProps` option (wins over `body`).
      //   3. Per-message `body` arg passed to `sendMessage` (highest).
      // The AG-UI standard `threadId` is sent at the wire's top level for
      // run/conversation correlation, so we no longer auto-emit a separate
      // `conversationId` here — `chat({ threadId })` server-side covers the
      // same role for devtools/observability.
      const mergedBody = {
        ...this.bodyOption,
        ...this.forwardedPropsOption,
        ...this.pendingMessageBody,
      }

      // Clear the pending message body after use
      this.pendingMessageBody = undefined

      // Generate stream ID — assistant message will be created by stream events
      this.currentStreamId = this.generateUniqueId('stream')
      this.devtoolsBridge.setCurrentStreamId(this.currentStreamId)
      this.currentMessageId = null
      this.activeClientTools = clientTools
      this.activeContext = runtimeContext

      // Reset processor stream state for new response — prevents stale
      // messageStates entries (from a previous stream) from blocking
      // creation of a new assistant message (e.g. after reload).
      this.processor.prepareAssistantMessage()

      // Ensure subscription loop is running
      this.ensureSubscription()

      // Set up promise that resolves when onStreamEnd fires
      const processingComplete = this.waitForProcessing()

      // Build per-send run context for AG-UI compliance
      // Note: mergedBody already contains the merged this.body + pendingMessageBody
      // (pendingMessageBody was cleared above, so we use mergedBody as forwardedProps)
      // Convert each client tool's `inputSchema` (a Standard Schema:
      // Zod, ArkType, Valibot, etc.) to JSON Schema for the wire. Foreign
      // AG-UI servers consuming `RunAgentInput.tools[].parameters` expect
      // JSON Schema; sending a Standard Schema instance directly would
      // serialize to an unusable shape.
      const runContext = {
        threadId: resumeThreadId ?? this.threadId,
        runId,
        ...(resumeParentRunId !== null
          ? { parentRunId: resumeParentRunId }
          : {}),
        clientTools: Array.from(clientTools.values()).map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema
            ? convertSchemaToJsonSchema(t.inputSchema)
            : { type: 'object' },
        })),
        forwardedProps: { ...mergedBody },
        ...(resumeItems ? { resume: resumeItems } : {}),
      }
      this.devtoolsBridge.beginRun(runContext.runId, runContext.threadId)
      activeDevtoolsRunId = runContext.runId
      this.devtoolsBridge.emitRunLifecycle(
        'run:created',
        runContext.runId,
        'created',
      )
      this.devtoolsBridge.emitRunLifecycle(
        'run:started',
        runContext.runId,
        'started',
      )
      this.devtoolsBridge.emitSnapshot()

      // Send through normalized connection (pushes chunks to subscription queue)
      await this.connection.send(messages, mergedBody, signal, runContext)

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mutated asynchronously during await
      if (generation !== this.streamGeneration || signal.aborted) {
        return false
      }

      // Wait for subscription loop to finish processing all chunks
      await processingComplete

      // If this stream was superseded (e.g. by reload()), bail out —
      // the new stream owns the processor and processingResolve now.
      if (generation !== this.streamGeneration) {
        return false
      }

      // A RUN_ERROR from the stream transitions status to error.
      // Do not treat this stream as a successful completion.
      if (this.status === 'error') {
        if (activeDevtoolsRunId) {
          this.devtoolsBridge.emitRunLifecycle(
            'run:errored',
            activeDevtoolsRunId,
            'errored',
            this.error ? { error: this.error.message } : {},
          )
          runTerminalEventEmitted = true
        }
        return false
      }

      // Wait for pending client tool executions
      if (this.pendingToolExecutions.size > 0) {
        await Promise.all(this.pendingToolExecutions.values())
      }

      // Finalize (idempotent — may already be done by RUN_FINISHED handler)
      this.processor.finalizeStream()
      streamCompletedSuccessfully = true
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          if (activeDevtoolsRunId) {
            this.devtoolsBridge.emitRunLifecycle(
              'run:cancelled',
              activeDevtoolsRunId,
              'cancelled',
            )
            runTerminalEventEmitted = true
          }
          return false
        }
        if (generation === this.streamGeneration) {
          this.reportStreamError(err)
          if (activeDevtoolsRunId) {
            this.devtoolsBridge.emitRunLifecycle(
              'run:errored',
              activeDevtoolsRunId,
              'errored',
              { error: err.message },
            )
            runTerminalEventEmitted = true
          }
        }
      }
    } finally {
      // Only clean up if this is still the active stream.
      // A superseded stream (e.g. reload() started a new one) must not
      // clobber the new stream's abortController or isLoading state.
      if (generation === this.streamGeneration) {
        this.currentStreamId = null
        this.devtoolsBridge.setCurrentStreamId(null)
        this.currentMessageId = null
        this.currentRunId = null
        this.activeClientTools = null
        this.activeContext = undefined
        this.abortController = null
        this.setIsLoading(false)
        this.pendingMessageBody = undefined // Ensure it's cleared even on error

        if (activeDevtoolsRunId && !runTerminalEventEmitted) {
          if (streamCompletedSuccessfully) {
            this.devtoolsBridge.emitRunLifecycle(
              'run:completed',
              activeDevtoolsRunId,
              'completed',
            )
          } else if (signal.aborted) {
            this.devtoolsBridge.emitRunLifecycle(
              'run:cancelled',
              activeDevtoolsRunId,
              'cancelled',
            )
          }
        }

        // Drain any actions that were queued while the stream was in progress
        await this.drainPostStreamActions()

        // Continue conversation if the stream ended with a tool result (server tool completed)
        // but ONLY if the model indicated it wants to continue (finishReason !== 'stop').
        // When finishReason is 'stop', the model is done — don't re-send.
        if (streamCompletedSuccessfully) {
          const messages = this.processor.getMessages()
          const lastPart = messages.at(-1)?.parts.at(-1)
          const { finishReason } = this.processor.getState()

          if (
            lastPart?.type === 'tool-result' &&
            finishReason !== 'stop' &&
            this.shouldAutoSend()
          ) {
            try {
              await this.checkForContinuation()
            } catch (error) {
              console.error('Failed to continue flow after tool result:', error)
              // Continuation failed without starting a new stream — don't
              // leave queued user messages stranded forever. (isLoading is
              // already false in this finally block.)
              await this.drainQueue()
            }
          } else {
            if (this.status !== 'ready') {
              // Terminal run, but onStreamEnd never fired: the processor had
              // no assistant message to emit it for (e.g. a bare
              // RUN_FINISHED{stop}, #421). The normal path already set
              // 'ready', so this is a no-op.
              this.setStatus('ready')
            }
            // Auto-send queued messages once the run fully settles. When a
            // continuation runs instead (tool-result branch above), that
            // continuation's own finally drains the queue. Skip if a drain
            // loop is already walking the queue (avoids nested re-entry).
            if (!this.messageQueueDraining) {
              await this.drainQueue()
            }
          }
        } else {
          // Error/abort settle for the active generation: don't strand or
          // later mis-order queued messages. A failed turn flushes the queue
          // (consistent with stop()); it must NOT auto-drain into a likely
          // broken endpoint.
          this.flushQueue()
        }
      }
    }

    return streamCompletedSuccessfully
  }

  /**
   * Start the client subscription loop.
   * This controls the connection lifecycle independently from request lifecycle.
   */
  subscribe(options?: { restart?: boolean }): void {
    const restart = options?.restart === true
    if (this.isSubscribed && !restart) {
      return
    }

    if (this.isSubscribed && restart) {
      this.abortSubscriptionLoop()
    }

    this.setIsSubscribed(true)
    this.setConnectionStatus('connecting')
    this.startSubscription()
  }

  /**
   * Unsubscribe and fully tear down live behavior.
   * This aborts an in-flight request and the subscription loop.
   */
  unsubscribe(): void {
    this.cancelInFlightStream({
      setReadyStatus: true,
      abortSubscription: true,
    })
    this.discardPendingSends()
    this.resetSessionGenerating()
    this.setIsSubscribed(false)
    this.setConnectionStatus('disconnected')
  }

  /**
   * Reload the last assistant message
   */
  async reload(): Promise<void> {
    const messages = this.processor.getMessages()
    if (messages.length === 0) return

    // Find the last user message
    const lastUserMessageIndex = messages.findLastIndex(
      (m) => m.role === 'user',
    )

    if (lastUserMessageIndex === -1) return

    // Cancel any active stream before reloading
    if (this.isLoading) {
      this.cancelInFlightStream()
    }
    // Discard pending follow-ups so "regenerate last answer" does not also
    // auto-send messages that were typed during the previous stream.
    this.discardPendingSends()

    this.events.reloaded(lastUserMessageIndex)

    // Remove all messages after the last user message
    this.processor.removeMessagesAfter(lastUserMessageIndex)
    this.devtoolsBridge.emitSnapshot()

    // Resend
    await this.streamResponse()
  }

  /**
   * Stop the current stream
   */
  stop(): void {
    const hadLocalStream = this.abortController !== null
    this.cancelInFlightStream({ setReadyStatus: true })
    this.discardPendingSends()
    if (hadLocalStream) {
      this.resetSessionGenerating()
    }
    this.events.stopped()
  }

  /**
   * Clear all messages
   */
  clear(): void {
    const hadLocalStream = this.abortController !== null
    this.clearedStreamTracker.snapshotClear({
      messages: this.processor.getMessages(),
      activeRunIds: this.activeRunIds,
      currentRunId: this.currentRunId,
    })
    // Always cancel in-flight work so clear works without message persistence.
    if (this.isLoading || hadLocalStream) {
      this.cancelInFlightStream({ setReadyStatus: true })
      this.resetSessionGenerating({ preserveClearedStreamTracking: true })
    } else if (this.activeRunIds.size > 0) {
      this.resetSessionGenerating({ preserveClearedStreamTracking: true })
    }
    // Suppress persisting the empty snapshot that clearMessages emits, then
    // remove the stored conversation outright.
    this.persistor?.beginClear()
    this.processor.clearMessages()
    this.discardPendingSends()
    this.persistor?.remove()
    this.lastResume = null
    this.interruptManager.reset()
    this.pendingResumeThreadId = null
    this.pendingResumeParentRunId = null
    this.pendingResumeItems = null
    this.setError(undefined)
    this.events.messagesCleared()
  }

  /**
   * Add the result of a client-side tool execution
   */
  async addToolResult(result: ClientToolResult): Promise<void> {
    const clientTool = this.clientToolsRef.current.get(result.tool)
    await this.addToolResultForClientTool(result, clientTool)
  }

  private async addToolResultForClientTool(
    result: ClientToolResult,
    clientTool: AnyClientTool | undefined,
    context?: ChatClientRunEventContext,
  ): Promise<void> {
    if (clientTool && result.state !== 'output-error') {
      try {
        result = {
          ...result,
          output: this.validateClientToolOutput(clientTool, result.output),
        }
      } catch (error: any) {
        result = {
          ...result,
          output: null,
          state: 'output-error',
          errorText: error.message,
        }
      }
    }

    this.events.toolResultAdded(
      result.toolCallId,
      result.tool,
      result.output,
      result.state || 'output-available',
      context,
    )

    // Always update local message state so the tool-call part is terminal in
    // the UI even when the AG-UI interrupt path owns server continuation.
    this.processor.addToolResult(
      result.toolCallId,
      result.output,
      result.state === 'output-error'
        ? result.errorText || 'Tool execution failed'
        : undefined,
    )
    this.devtoolsBridge.emitSnapshot()

    const resolvedViaInterrupt = this.interruptManager.resolveClientToolOutput(
      result.toolCallId,
      result.state === 'output-error'
        ? { error: result.errorText || 'Tool execution failed' }
        : result.output,
    )
    if (resolvedViaInterrupt) {
      // Interrupt manager stages/submits the resume batch (deferred until the
      // parent stream settles when still loading). Skip legacy continuation.
      return
    }

    // If stream is in progress, queue continuation check for after it ends
    if (this.isLoading) {
      this.queuePostStreamAction(() => this.checkForContinuation())
      return
    }

    await this.checkForContinuation()
  }

  private validateClientToolOutput(
    clientTool: AnyClientTool,
    output: any,
  ): any {
    if (clientTool.outputSchema && isStandardSchema(clientTool.outputSchema)) {
      return parseWithStandardSchema(clientTool.outputSchema, output)
    }

    return output
  }

  /**
   * Respond to a tool approval request
   */
  async addToolApprovalResponse(response: {
    id: string // approval.id, not toolCallId
    approved: boolean
  }): Promise<void> {
    // Reflect the decision on the tool-call part so approval UIs that render
    // from `part.state` (the deprecated pre-interrupt pattern) clear the prompt
    // and show the response. The bound interrupt resolution below drives the
    // actual continuation; this keeps the legacy message-state surface in sync.
    this.processor.addToolApprovalResponse(response.id, response.approved)
    this.devtoolsBridge.emitSnapshot()

    if (
      this.interruptManager.resolveToolApprovalDecision(
        response.id,
        response.approved,
      )
    ) {
      return
    }
    // Find the tool call ID from the approval ID
    const messages = this.processor.getMessages()
    let foundToolCallId: string | undefined

    for (const msg of messages) {
      const toolCallPart = msg.parts.find(
        (p: MessagePart): p is ToolCallPart =>
          p.type === 'tool-call' && p.approval?.id === response.id,
      )
      if (toolCallPart) {
        foundToolCallId = toolCallPart.id
        break
      }
    }

    if (foundToolCallId) {
      this.events.toolApprovalResponded(
        response.id,
        foundToolCallId,
        response.approved,
      )
    }

    // Add response via processor
    this.processor.addToolApprovalResponse(response.id, response.approved)
    this.devtoolsBridge.emitSnapshot()

    // If stream is in progress, queue continuation check for after it ends
    if (this.isLoading) {
      this.queuePostStreamAction(() => this.checkForContinuation())
      return
    }

    await this.checkForContinuation()
  }

  /**
   * Queue an action to be executed after the current stream ends
   */
  private queuePostStreamAction(action: () => Promise<void>): void {
    this.postStreamActions.push(action)
  }

  /**
   * Drain and execute all queued post-stream actions
   */
  private async drainPostStreamActions(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      let action: (() => Promise<void>) | undefined
      while ((action = this.postStreamActions.shift()) !== undefined) {
        await action()
      }
    } finally {
      this.draining = false
    }
  }

  /**
   * Check if we should continue the flow and do so if needed
   */
  private async checkForContinuation(): Promise<void> {
    // Prevent duplicate continuation attempts
    if (this.continuationPending || this.isLoading) {
      this.continuationSkipped = true
      return
    }

    if (this.shouldAutoSend()) {
      this.continuationPending = true
      this.continuationSkipped = false
      let succeeded = false
      try {
        succeeded = await this.streamResponse()
      } finally {
        this.continuationPending = false
      }
      // If a queued check was skipped while continuationPending was true
      // (e.g. a chained approval responded to during the stream), re-evaluate
      // now that the flag is cleared. Only replay after a successful stream —
      // aborted or errored streams should not trigger further continuation.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mutated asynchronously during await
      if (this.continuationSkipped && succeeded) {
        this.continuationSkipped = false
        await this.checkForContinuation()
      }
    }
  }

  /**
   * Check if all tool calls are complete and we should auto-send.
   * Requires that there is at least one tool call in the last assistant message;
   * a text-only response has nothing to auto-send.
   */
  private shouldAutoSend(): boolean {
    const messages = this.processor.getMessages()
    const lastAssistant = messages.findLast(
      (m: UIMessage) => m.role === 'assistant',
    )
    if (!lastAssistant) return false
    const hasToolCalls = lastAssistant.parts.some(
      (p: MessagePart) => p.type === 'tool-call',
    )
    if (!hasToolCalls) return false
    return this.processor.areAllToolsComplete()
  }

  /**
   * Get current messages
   */
  getMessages(): Array<UIMessage<TTools>> {
    return this.processor.getMessages() as Array<UIMessage<TTools>>
  }

  /**
   * True when an interrupt (or another direct send) claimed the client during
   * a drain. Read via a method so cross-await mutations are not constant-folded
   * by control-flow analysis.
   */
  private shouldAbortMessageQueueDrain(): boolean {
    return this.isLoading || this.stopMessageQueueDrain
  }

  /**
   * Deliver queued messages after a successful settle.
   * - `batch`: merge everything currently queued into one send, looping so
   *   messages enqueued during that batch stream are not stranded.
   * - `fifo`: walk the queue in a loop, one stream at a time, until empty
   *   (or until another send claims the client via interrupt).
   *
   * Uses `deliverMessage` directly so drains do not re-enter `sendMessage`'s
   * busy/queue policy (which would re-queue items and strand the rest).
   */
  private async drainQueue(): Promise<void> {
    // Note: do not gate on `sendInFlight`. Normal sends still hold
    // `sendInFlight` while `streamResponse`'s finally invokes drain; blocking
    // on it would permanently strand the queue.
    if (
      this.messageQueueDraining ||
      this.isLoading ||
      this.messageQueue.length === 0
    ) {
      return
    }

    this.messageQueueDraining = true
    this.stopMessageQueueDrain = false
    try {
      if (this.queueConfig.drain === 'batch') {
        while (this.messageQueue.length > 0) {
          if (this.shouldAbortMessageQueueDrain()) {
            return
          }
          const items = this.messageQueue.splice(0)
          this.emitQueueChange()
          const merged = mergeQueuedMessages(items)
          const completed = await this.deliverMessage(
            merged.content,
            merged.body,
          )
          // Failed/aborted deliver flushes the rest of the queue in streamResponse.
          if (!completed || this.shouldAbortMessageQueueDrain()) {
            return
          }
        }
        return
      }

      while (this.messageQueue.length > 0) {
        // Interrupt (or a new direct send) claimed the client — stop draining;
        // remaining items stay queued and will drain after that send settles.
        if (this.shouldAbortMessageQueueDrain()) {
          return
        }
        const next = this.messageQueue.shift()
        if (next === undefined) {
          return
        }
        this.emitQueueChange()
        const completed = await this.deliverMessage(next.content, next.body)
        // Failed/aborted deliver flushes the rest of the queue in streamResponse.
        if (!completed || this.shouldAbortMessageQueueDrain()) {
          return
        }
      }
    } finally {
      this.messageQueueDraining = false
      this.stopMessageQueueDrain = false
    }
  }

  /**
   * Drop any in-flight send claim and discard pending queued messages
   * (stop / error / clear / unsubscribe / reload).
   */
  private discardPendingSends(): void {
    this.sendInFlight = false
    this.flushQueue()
  }

  /**
   * Get the current send queue (messages held while a stream was in flight).
   */
  getQueue(): Array<QueuedMessage> {
    return this.messageQueue.map(({ id, content, createdAt }) => ({
      id,
      content,
      createdAt,
    }))
  }

  private emitQueueChange(): void {
    this.callbacksRef.current.onQueueChange(this.getQueue())
    this.devtoolsBridge.emitSnapshot()
  }

  /**
   * Remove a queued message by id before it drains.
   */
  cancelQueued(id: string): void {
    const index = this.messageQueue.findIndex((m) => m.id === id)
    if (index === -1) return
    this.messageQueue.splice(index, 1)
    this.emitQueueChange()
  }

  /**
   * Discard all pending queued messages (stop / error / clear / unsubscribe /
   * reload). Does not send them. Emits `onQueueChange([])` when anything was
   * removed.
   */
  private flushQueue(): void {
    if (this.messageQueue.length === 0) return
    this.messageQueue = []
    this.emitQueueChange()
  }

  /**
   * Get loading state
   */
  getIsLoading(): boolean {
    return this.isLoading
  }

  /**
   * Get current status
   */
  getStatus(): ChatClientState {
    return this.status
  }

  /**
   * Get whether the subscription loop is active
   */
  getIsSubscribed(): boolean {
    return this.isSubscribed
  }

  /**
   * Get current connection lifecycle status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus
  }

  /**
   * Whether the shared session is actively generating.
   * Derived from stream run events (RUN_STARTED / RUN_FINISHED / RUN_ERROR).
   * Unlike `isLoading` (request-local), this reflects shared generation
   * activity visible to all subscribers (e.g. across tabs/devices).
   */
  getSessionGenerating(): boolean {
    return this.sessionGenerating
  }

  /**
   * Get current error
   */
  getError(): Error | undefined {
    return this.error
  }

  /**
   * Manually set messages
   */
  setMessagesManually(messages: Array<UIMessage<TTools>>): void {
    this.processor.setMessages(messages)
    this.devtoolsBridge.emitSnapshot()
  }

  /**
   * Update options refs (for use in React hooks to avoid recreating client)
   */
  updateOptions(options: ChatClientUpdateOptionsWithoutContext<TTools>): void
  updateOptions(
    options: ChatClientUpdateOptionsWithoutContext<TTools> &
      Pick<ChatClientOptions<TTools, TContext>, 'context'>,
  ): void
  updateOptions(
    options: ChatClientUpdateOptionsWithoutContext<TTools> & {
      context?: TContext | undefined
    },
  ): void {
    if (options.connection !== undefined || options.fetcher !== undefined) {
      const wasSubscribed = this.isSubscribed

      if (this.isLoading) {
        this.cancelInFlightStream({
          setReadyStatus: true,
          abortSubscription: true,
        })
      } else if (wasSubscribed) {
        this.abortSubscriptionLoop()
      }

      this.resetSessionGenerating()
      this.setIsSubscribed(false)
      this.setConnectionStatus('disconnected')
      this.connection = normalizeConnectionAdapter(
        resolveTransport({
          connection: options.connection,
          fetcher: options.fetcher,
        }),
      )

      if (wasSubscribed) {
        this.subscribe()
      }
    }
    // Replace each wire-payload slot independently so callers can update one
    // without wiping the other. Passing `undefined` for `body` or
    // `forwardedProps` leaves that slot unchanged; context is cleared when the
    // key is present with an `undefined` value.
    if (options.body !== undefined) {
      this.bodyOption = options.body
    }
    if (options.forwardedProps !== undefined) {
      this.forwardedPropsOption = options.forwardedProps
    }
    if ('context' in options) {
      this.context = options.context
    }
    if (options.tools !== undefined) {
      this.interruptManager.updateTools(options.tools)
      this.clientToolsRef.current = new Map()
      for (const tool of options.tools) {
        this.clientToolsRef.current.set(tool.name, tool)
      }
      this.devtoolsBridge.notifyToolsChanged()
    }
    if (options.queue !== undefined) {
      this.queueConfig = normalizeQueueOption(options.queue)
    }
    if (options.onResponse !== undefined) {
      this.callbacksRef.current.onResponse = options.onResponse
    }
    if (options.onChunk !== undefined) {
      this.callbacksRef.current.onChunk = options.onChunk
    }
    if (options.onFinish !== undefined) {
      this.callbacksRef.current.onFinish = options.onFinish
    }
    if (options.onError !== undefined) {
      this.callbacksRef.current.onError = options.onError
    }
    if (options.onSubscriptionChange !== undefined) {
      this.callbacksRef.current.onSubscriptionChange =
        options.onSubscriptionChange
    }
    if (options.onConnectionStatusChange !== undefined) {
      this.callbacksRef.current.onConnectionStatusChange =
        options.onConnectionStatusChange
    }
    if (options.onSessionGeneratingChange !== undefined) {
      this.callbacksRef.current.onSessionGeneratingChange =
        options.onSessionGeneratingChange
    }
    if (options.onQueueChange !== undefined) {
      this.callbacksRef.current.onQueueChange = options.onQueueChange
    }
    if (options.onResumeStateChange !== undefined) {
      this.callbacksRef.current.onResumeStateChange =
        options.onResumeStateChange
    }
    if (options.onInterruptStateChange !== undefined) {
      this.callbacksRef.current.onInterruptStateChange =
        options.onInterruptStateChange
    }
    if (options.onCustomEvent !== undefined) {
      this.callbacksRef.current.onCustomEvent = options.onCustomEvent
    }
  }

  dispose(): void {
    this.unsubscribe()
    this.devtoolsBridge.dispose()
    this.devtoolsMounted = false
  }
}
