import {
  StreamProcessor,
  convertSchemaToJsonSchema,
  generateMessageId,
  isStandardSchema,
  mergeMetadata,
  normalizeToUIMessage,
  parseWithStandardSchema,
  restoreInboundChunk,
  tanstackMetadata,
} from '@tanstack/ai/client'
import {
  ByokBlockedError,
  ByokMissingError,
  ByokUnresolvedProviderError,
} from '@tanstack/ai/byok'
import {
  prepareResolvedByokHeaders,
  resolveByokProviderId,
} from './byok/resolve'
import { createNoOpChatDevtoolsBridge } from './devtools-noop'
import {
  fetcherToConnectionAdapter,
  getChunkRunId,
  normalizeConnectionAdapter,
} from './connection-adapters'
import { ChatPersistor } from './client-persistor'
import { ClearedStreamTracker } from './cleared-stream-tracker'
import { normalizeMessagesDates } from './message-date-normalizer'
import { InterruptManager } from './interrupt-manager'
import type {
  AnyClientTool,
  ContentPart,
  InterruptDefinition,
  InterruptSubmissionError,
  ModelMessage,
  RunAgentResumeItem,
  StreamChunk,
} from '@tanstack/ai/client'
import type { ByokClient } from './byok'
import type {
  ChatHydrationResult,
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
  ChatInterruptState,
  ResolvableChatInterrupt,
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
import type {
  InterruptManagerChangeSource,
  InterruptManagerSubmission,
} from './interrupt-manager'

/** Internal queue entry — public {@link QueuedMessage} plus optional per-send body. */
interface InternalQueuedMessage extends QueuedMessage {
  /** @deprecated Use `forwardedProps` instead. */
  body?: Record<string, any>
}

function assertUniqueInterruptDefinitions(
  interrupts:
    | ReadonlyArray<InterruptDefinition<any, any, any, any>>
    | undefined,
): void {
  const ids = new Set<string>()
  for (const interrupt of interrupts ?? []) {
    if (ids.has(interrupt.id)) {
      throw new Error(`Duplicate interrupt definition id: ${interrupt.id}`)
    }
    ids.add(interrupt.id)
  }
}

type ChatClientUpdateOptionsWithoutContext<
  TTools extends ReadonlyArray<AnyClientTool>,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> = {
  connection?: ConnectionAdapter
  fetcher?: ChatFetcher
  /** @deprecated Use `forwardedProps` instead. */
  body?: Record<string, any>
  forwardedProps?: Record<string, any>
  byok?: ByokClient
  byokProvider?: () => string | undefined
  tools?: TTools
  interrupts?: TInterrupts
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
    pendingInterrupts: BoundInterrupts<TTools, TInterrupts>,
  ) => void
  /**
   * Fires whenever the id of the run in flight changes: the new id when a run
   * starts (including a rejoin), `null` when it settles.
   */
  onRunIdChange?: (runId: string | null) => void
  onInterruptStateChange?: (
    state: ChatInterruptState<TTools, TInterrupts>,
    context: { source: 'hydrate' | 'live' },
  ) => void
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
  const hasBothTransports = connection && fetcher
  if (hasBothTransports) {
    throw new Error(
      'ChatClient: pass either `connection` or `fetcher`, not both.',
    )
  }
  if (connection) return connection
  if (fetcher) return fetcherToConnectionAdapter(fetcher)
  throw new Error('ChatClient: either `connection` or `fetcher` is required.')
}

/**
 * `connect()` adapters push the full HTTP body into the subscribe queue, then
 * wait until that queue is idle. After `send()` returns, every chunk from this
 * request has been processed. Subscribe/send sockets do not drain that way.
 */
function connectionDrainsOnSend(connection: ConnectionAdapter): boolean {
  return 'connect' in connection
}

function isIntermediateToolTurn(chunk: StreamChunk): boolean {
  if (chunk.type !== 'RUN_FINISHED') return false
  if (chunk.outcome?.type === 'interrupt') return false
  const extra = chunk as StreamChunk & { finishReason?: unknown }
  if (extra.finishReason !== undefined) {
    return extra.finishReason === 'tool_calls'
  }
  return tanstackMetadata(chunk)?.finishReason === 'tool_calls'
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
    const isValidMaxSize = Number.isInteger(maxSize) && maxSize >= 0
    if (!isValidMaxSize) {
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
 * Object-form metadata is merged last-write-wins per key.
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
  let metadata: Record<string, any> | undefined
  for (const item of items) {
    if (typeof item.content === 'string') {
      parts.push({ type: 'text', content: item.content })
      continue
    }
    if (typeof item.content.content === 'string') {
      parts.push({ type: 'text', content: item.content.content })
    } else {
      parts.push(...item.content.content)
    }
    metadata = mergeMetadata(metadata, item.content.metadata)
  }
  return {
    content: {
      content: parts,
      ...(metadata !== undefined ? { metadata } : {}),
    },
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

/**
 * How long a reload rejoin waits for its first chunk before giving up. A durable
 * backend keeps a from-start join open waiting for a producer; without this
 * bound a stale pointer to an unknown/evicted run would pin the UI loading for
 * the backend's full first-chunk deadline (tens of seconds). Kept short so the
 * client decides "reachable or not" quickly.
 */
const REJOIN_CONNECT_DEADLINE_MS = 2000

/**
 * Chunk types that (re)build the assistant message on a rejoin. The hydrated
 * in-flight partial is dropped only when one of these arrives — never on
 * `RUN_STARTED` alone — so a rejoin that connects but delivers no content cannot
 * leave an empty assistant bubble.
 */
const REJOIN_REBUILD_TRIGGERS = new Set<string>([
  'TEXT_MESSAGE_START',
  'TEXT_MESSAGE_CONTENT',
  'TOOL_CALL_START',
  'MESSAGES_SNAPSHOT',
])

function createClientToolsMap(
  tools: ReadonlyArray<AnyClientTool> | undefined,
): Map<string, AnyClientTool> {
  const map = new Map<string, AnyClientTool>()
  if (!tools) return map
  for (const tool of tools) {
    map.set(tool.name, tool)
  }
  return map
}

function createChatClientCallbacks<
  TTools extends ReadonlyArray<AnyClientTool>,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
>(options: ChatClientOptions<TTools, any, TInterrupts>) {
  return {
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
      onConnectionStatusChange: options.onConnectionStatusChange || (() => {}),
      onSessionGeneratingChange:
        options.onSessionGeneratingChange || (() => {}),
      onQueueChange: options.onQueueChange || (() => {}),
      onResumeStateChange: options.onResumeStateChange || (() => {}),
      onRunIdChange: options.onRunIdChange || (() => {}),
      onInterruptStateChange: options.onInterruptStateChange || (() => {}),
      onCustomEvent: options.onCustomEvent || (() => {}),
    },
  }
}

function snapshotHasPendingInterrupts(snapshot: ChatResumeSnapshot): boolean {
  return (
    Array.isArray(snapshot.pendingInterrupts) &&
    snapshot.pendingInterrupts.length > 0
  )
}

export class ChatClient<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = unknown,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    any,
> {
  private readonly processor: StreamProcessor
  private connection: SubscribeConnectionAdapter
  private uniqueId: string
  private threadId: string
  private readonly persistor?: ChatPersistor
  private readonly clearedStreamTracker = new ClearedStreamTracker()
  private currentRunId: string | null = null
  private lastResume: ChatResumeState | null = null
  private rejoinedRunId: string | null = null
  private readonly interruptManager: InterruptManager<TTools, TInterrupts>
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
  private bodyOption: Record<string, any> = {}
  private forwardedPropsOption: Record<string, any> = {}
  private byok: ByokClient | undefined
  private byokProvider: (() => string | undefined) | undefined
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
  /** `connect()` send() drains the subscribe queue. Sockets wait for a terminal event. */
  private connectionDrainsOnSend = false
  private errorReportedGeneration: number | null = null
  private streamGeneration = 0
  private continuationGeneration = 0
  private streamContinuationGeneration = 0
  // Tracks whether a queued checkForContinuation was skipped because
  // continuationPending was true (chained approval scenario)
  private continuationSkipped = false
  private draining = false
  private sessionGenerating = false
  private readonly activeRunIds = new Set<string>()
  /** Latched by `dispose()`; stops any late async callback starting new work. */
  private disposed = false
  /** Whether a view is currently watching. See `attach` / `detach`. */
  private tailing = false
  /** Constructor inputs `attach()` needs on every re-attach, not just the first. */
  private readonly rejoinRunId: string | null | undefined
  private readonly cachesMessages: boolean
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
        pendingInterrupts: BoundInterrupts<TTools, TInterrupts>,
      ) => void
      onRunIdChange: (runId: string | null) => void
      onInterruptStateChange: (
        state: ChatInterruptState<TTools, TInterrupts>,
        context: { source: 'hydrate' | 'live' },
      ) => void
      onCustomEvent: (
        eventType: string,
        data: unknown,
        context: { toolCallId?: string },
      ) => void
    }
  }

  constructor(options: ChatClientOptions<TTools, TContext, TInterrupts>) {
    assertUniqueInterruptDefinitions(options.interrupts)
    this.threadId = options.threadId || ''
    this.uniqueId = this.threadId
    const persistence = this.createChatPersistor(options)
    this.persistor = persistence.persistor
    const cachesMessages = persistence.cachesMessages
    this.bodyOption = options.body || {}
    this.forwardedPropsOption = options.forwardedProps || {}
    this.byok = options.byok
    this.byokProvider = options.byokProvider
    this.context = options.context
    this.queueConfig = normalizeQueueOption(options.queue)
    const transport = resolveTransport(options)
    this.connectionDrainsOnSend = connectionDrainsOnSend(transport)
    this.connection = normalizeConnectionAdapter(transport)

    this.clientToolsRef = { current: createClientToolsMap(options.tools) }

    this.devtoolsBridge = (
      options.devtoolsBridgeFactory ?? createNoOpChatDevtoolsBridge
    )(this.buildDevtoolsBridgeOptions(options.devtools))
    this.events = this.devtoolsBridge.events

    this.callbacksRef = createChatClientCallbacks(options)

    this.interruptManager = new InterruptManager<TTools, TInterrupts>({
      ...(options.tools !== undefined ? { tools: options.tools } : {}),
      ...(options.interrupts !== undefined
        ? { interrupts: options.interrupts }
        : {}),
      submit: (submission) => this.submitInterruptBatch(submission),
      onChange: (source) => this.notifyResumeStateChange(source),
    })

    if (options.initialResumeSnapshot) {
      this.applyResumeSnapshot(options.initialResumeSnapshot)
    }

    const persistedState = this.persistor?.readInitial()
    const syncPersistedState =
      persistedState instanceof Promise ? undefined : persistedState
    const initialMessages = syncPersistedState
      ? syncPersistedState.messages
      : options.initialMessages
    /** Constructor inputs `attach()` needs on every re-attach, not just the first. */
    const rejoinRunId = this.resolveConstructorRejoinRunId(
      options,
      syncPersistedState,
    )

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
            const continuationGeneration = this.continuationGeneration
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
                  continuationGeneration,
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
                  continuationGeneration,
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
          if (eventType === 'memory:state') {
            this.devtoolsBridge.recordMemoryState(data)
          }
          if (eventType === 'skills:state') {
            this.devtoolsBridge.recordSkillsState(data)
          }
          this.callbacksRef.current.onCustomEvent(eventType, data, context)
        },
      },
    })

    this.persistor?.hydrateAsync(persistedState)

    this.rejoinRunId = rejoinRunId
    this.cachesMessages = cachesMessages
  }

  private createChatPersistor(
    options: ChatClientOptions<TTools, TContext, TInterrupts>,
  ): { cachesMessages: boolean; persistor?: ChatPersistor } {
    if (options.persistence === true) {
      if (!options.threadId) {
        throw new Error(
          '[TanStack AI] persistence needs a stable `threadId` to key on. Pass a threadId from your app (for example support-42).',
        )
      }
      return { cachesMessages: false }
    }
    if (!options.persistence) {
      return { cachesMessages: true }
    }
    if (!options.threadId) {
      throw new Error(
        '[TanStack AI] persistence needs a stable `threadId` to key on. Pass a threadId from your app (for example support-42).',
      )
    }
    return {
      cachesMessages: true,
      persistor: new ChatPersistor(
        options.persistence,
        options.threadId,
        (messages) => this.processor.setMessages(messages),
        (snapshot) => this.applyPersistedResume(snapshot),
      ),
    }
  }

  private resolveConstructorRejoinRunId(
    options: ChatClientOptions<TTools, TContext, TInterrupts>,
    syncPersistedState: { resume?: ChatResumeSnapshot } | undefined,
  ): string | null {
    if (syncPersistedState?.resume) {
      const snapshot = syncPersistedState.resume
      if (snapshotHasPendingInterrupts(snapshot)) {
        // Interrupts are run-scoped state, restored from the cached snapshot.
        this.applyResumeSnapshot(snapshot)
      } else if (snapshot.resumeState.runId) {
        // A bare in-flight run pointer drives a client-authoritative rejoin.
        return snapshot.resumeState.runId
      }
    }
    if (!options.initialResumeSnapshot) return null
    const snapshot = options.initialResumeSnapshot
    if (!snapshotHasPendingInterrupts(snapshot) && snapshot.resumeState.runId) {
      return snapshot.resumeState.runId
    }
    return null
  }

  /**
   * START TAILING: re-attach to an in-flight run so its chunks arrive here.
   *
   * Called by the constructor, and again by a UI wrapper every time its view
   * mounts. Idempotent — attaching while already attached does nothing — so the
   * constructor call and a wrapper's first mount cost one attach between them.
   *
   * Pairs with {@link detach}. The pair exists because tailing used to begin ONLY
   * in the constructor, which meant a view could never stop tailing and then
   * resume: unmount had to either keep the connection open or lose it for good.
   * Keeping it open is what starved the page — a browser allows ~6 connections per
   * origin, and one long-lived stream per view reaches that after a handful of
   * views, after which every other request queues (measured: an in-page fetch took
   * over two minutes while the same request from outside the browser took 17ms).
   */
  attach(): void {
    const cannotAttach = this.disposed || this.tailing
    if (cannotAttach) return
    this.ensureThreadId()
    this.tailing = true

    if (this.rejoinRunId) {
      this.maybeRejoinInFlight(this.rejoinRunId)
    }

    const needsServerHydrate = !this.cachesMessages && this.connection.hydrate
    if (needsServerHydrate) {
      this.hydrateFromServer()
    }
  }

  /**
   * STOP TAILING: drop the connection, keep everything else.
   *
   * Called by a UI wrapper when its view unmounts. The transcript, the resume
   * pointer and the run id all stay, so a later {@link attach} repaints instantly
   * and re-tails from the durable log — nothing is lost, because the run keeps
   * going server-side and its log holds every chunk.
   *
   * Deliberately NOT `dispose()`: this client is expected back. And deliberately
   * not `stop()`, which means "the user ended this run" — detaching says only that
   * nobody is watching right now.
   *
   * `rejoinedRunId` is cleared so the next `attach` can re-join the same run;
   * without that reset the guard in {@link maybeRejoinInFlight} would treat the
   * run as already joined and the view would come back silent.
   */
  detach(): void {
    if (!this.tailing) return
    this.tailing = false
    this.cancelInFlightStream({ setReadyStatus: true })
    this.rejoinedRunId = null
  }

  private applyResumeSnapshot(snapshot: ChatResumeSnapshot): void {
    const resumeState = readResumeState(snapshot)
    if (resumeState === undefined) {
      this.interruptManager.reset({ source: 'hydrate' })
      return
    }
    this.lastResume = resumeState
    const pendingInterrupts = Array.isArray(snapshot.pendingInterrupts)
      ? snapshot.pendingInterrupts
      : []
    if (pendingInterrupts.length === 0) {
      this.interruptManager.reset({ source: 'hydrate' })
      return
    }
    const generation = this.interruptGeneration(pendingInterrupts)
    this.interruptManager.hydrate(
      {
        threadId: resumeState.threadId,
        interruptedRunId: resumeState.runId,
        generation,
        interrupts: pendingInterrupts,
      },
      'hydrate',
    )
  }

  /**
   * Apply a resume snapshot read from durable storage. Restores interrupt state,
   * and for a bare in-flight run (no pending interrupts) also rejoins it. This is
   * the async-store counterpart to the synchronous rejoin in the constructor:
   * `applyResumeSnapshot` alone only handles interrupts, so an async store
   * (`indexedDBPersistence`) would otherwise never rejoin a mid-stream run.
   */
  private applyPersistedResume(snapshot: ChatResumeSnapshot): void {
    this.applyResumeSnapshot(snapshot)
    const hasInterrupts =
      Array.isArray(snapshot.pendingInterrupts) &&
      snapshot.pendingInterrupts.length > 0
    const runId = snapshot.resumeState?.runId
    if (!hasInterrupts && runId) {
      this.maybeRejoinInFlight(runId)
    }
  }

  /**
   * Rejoin a persisted in-flight run, guarded so it fires at most once and never
   * while another run is already active. Skipped when the connection is not
   * resumable (`joinRun` absent), so a non-durable transport is a no-op.
   */
  private maybeRejoinInFlight(runId: string): void {
    if (!this.connection.joinRun) return
    const isDetached = this.disposed || !this.tailing
    if (isDetached) return
    if (this.rejoinedRunId === runId) return
    // A fresh send (or an already-running rejoin) owns the client; don't stomp it.
    const hasActiveStream = this.isLoading || this.abortController
    if (hasActiveStream) return
    this.rejoinedRunId = runId
    this.resumeInFlightRun(runId)
  }

  /**
   * Server-authoritative mount hydration (`persistence: true`). The client holds
   * no transcript and no run pointer; on mount it asks the server — keyed by the
   * stable threadId — for the stored transcript and whether a run is still
   * generating. The transcript repaints immediately; an in-flight run is tailed
   * through the same durability rejoin as a reload. Best-effort and
   * non-blocking: a failure leaves the client empty rather than throwing, and a
   * send that starts first owns the client (hydration then backs off).
   */
  private hydrateFromServer(): void {
    const hydrate = this.connection.hydrate
    if (!hydrate) return
    const hasActiveStream = this.isLoading || this.abortController
    if (hasActiveStream) return
    if (this.disposed) return
    void (async () => {
      let result: ChatHydrationResult
      try {
        result = await hydrate(this.threadId)
      } catch {
        return
      }
      const isDetached = this.disposed || !this.tailing
      if (isDetached) return
      // A send may have started while the fetch was in flight — don't stomp it.
      const hasActiveStream = this.isLoading || this.abortController
      if (hasActiveStream) return
      if (result.messages.length > 0) {
        this.processor.setMessages(normalizeMessagesDates(result.messages))
      }
      if (result.interrupts && result.interrupts.pending.length > 0) {
        this.applyResumeSnapshot({
          resumeState: {
            threadId: this.threadId,
            runId: result.interrupts.runId,
          },
          pendingInterrupts: result.interrupts.pending,
        })
      } else if (result.activeRun?.runId) {
        this.maybeRejoinInFlight(result.activeRun.runId)
      }
    })()
  }

  mountDevtools(): void {
    this.ensureThreadId()
    if (this.devtoolsMounted) {
      return
    }

    this.devtoolsMounted = true
    this.devtoolsBridge.mountWithTools(this.processor.getMessages().length)
  }

  private ensureThreadId(): string {
    if (!this.threadId) {
      this.threadId = this.generateUniqueId('thread')
    }
    this.uniqueId = this.threadId
    return this.threadId
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
    const isTerminalChunk =
      chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
    if (!isTerminalChunk) return
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
      const shouldPersistResume =
        this.persistor && this.connection.joinRun && !this.lastResume
      if (shouldPersistResume) {
        this.persistResumeSnapshot({
          threadId: this.activeResumeThreadId ?? this.threadId,
          runId: chunkRunId,
        })
      }
      return
    }

    const isTerminalChunk =
      chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
    if (!isTerminalChunk) {
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
    const skipProcessingResolve =
      chunk.type === 'RUN_FINISHED' && isIntermediateToolTurn(chunk)
    const shouldResolveProcessing =
      options?.resolveProcessing !== false && !skipProcessingResolve
    if (shouldResolveProcessing) {
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
    const isTerminalChunk =
      chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
    if (!isTerminalChunk) {
      return
    }

    const isInterruptSubmitError =
      this.activeInterruptSubmission && chunk.type === 'RUN_ERROR'
    if (isInterruptSubmitError) {
      return
    }
    const runId = getChunkRunId(chunk)
    if (this.hydrateInterruptedRun(chunk, runId)) {
      return
    }
    if (this.shouldClearInterruptState(chunk, runId)) {
      this.lastResume = null
      // Run settled without an interrupt: drop the durable resume snapshot so a
      // later reload does not try to rejoin a finished run.
      this.persistor?.persistResumeSnapshot(null)
      this.interruptManager.reset()
      return
    }
    this.notifyResumeStateChange('live')
  }

  private hydrateInterruptedRun(
    chunk: StreamChunk,
    runId: string | undefined,
  ): boolean {
    if (
      chunk.type === 'RUN_FINISHED' &&
      chunk.outcome != null &&
      chunk.outcome.type === 'interrupt'
    ) {
      const threadId =
        'threadId' in chunk && typeof chunk.threadId === 'string'
          ? chunk.threadId
          : this.activeResumeThreadId
      // Track the REQUEST run id (what the client sent) so a resume targets the
      // same run even when provider events carry their own run id.
      const interruptedRunId =
        this.currentRunId ?? runId ?? this.activeResumeRunId ?? ''
      this.lastResume = {
        threadId: threadId ?? this.threadId,
        runId: interruptedRunId,
      }
      this.interruptManager.hydrate(
        {
          threadId: this.lastResume.threadId,
          interruptedRunId,
          generation: this.interruptGeneration(chunk.outcome.interrupts),
          interrupts: chunk.outcome.interrupts,
        },
        'live',
      )
      return true
    }
    return false
  }

  private isTrackedOrCurrentRunTerminal(runId: string | undefined): boolean {
    const isLastResumeRun = runId && this.lastResume?.runId === runId
    if (isLastResumeRun) return true
    const isCurrentRun = runId && this.currentRunId === runId
    if (isCurrentRun) return true
    return Boolean(
      this.currentRunId && this.lastResume?.runId === this.currentRunId,
    )
  }

  private isActiveStreamRunTerminal(runId: string | undefined): boolean {
    const hasNoActiveRun = !this.isLoading || !runId
    if (hasNoActiveRun) return false
    return runId === this.activeResumeRunId || runId === this.currentRunId
  }

  private shouldClearInterruptState(
    chunk: StreamChunk,
    runId: string | undefined,
  ): boolean {
    const isSessionRunError = chunk.type === 'RUN_ERROR' && !runId
    if (isSessionRunError) return true
    if (this.isTrackedOrCurrentRunTerminal(runId)) return true
    if (this.isActiveStreamRunTerminal(runId)) return true
    const isRunlessFinish =
      this.isLoading && chunk.type === 'RUN_FINISHED' && !runId
    if (isRunlessFinish) return true
    return Boolean(
      this.activeInterruptSubmission &&
      this.isLoading &&
      chunk.type === 'RUN_FINISHED' &&
      chunk.outcome?.type !== 'interrupt',
    )
  }

  /**
   * The interrupt-resume state for the active/interrupted run (its run/thread
   * ids), or null when there is nothing to resume. Apps can persist this to
   * resume interrupts across a full reload.
   */
  getResumeState(): ChatResumeState | null {
    return this.lastResume ? { ...this.lastResume } : null
  }

  /**
   * The id of the run this client has in flight — one it started via a send or
   * rejoined via `joinRun` — or null when there is none. Unlike
   * {@link getResumeState}, this tracks ordinary runs too, not only one that is
   * interrupted or being resumed. A run another client started and that arrives
   * over a live subscription is not this client's run and is not reported here.
   */
  getCurrentRunId(): string | null {
    return this.currentRunId
  }

  private setCurrentRunId(runId: string | null): void {
    if (this.currentRunId === runId) return
    this.currentRunId = runId
    this.callbacksRef.current.onRunIdChange(runId)
  }

  getInterruptState(): ChatInterruptState<TTools, TInterrupts> {
    return this.interruptManager.getState()
  }

  getInterrupts(): BoundInterrupts<TTools, TInterrupts> {
    return this.interruptManager.getInterrupts() as BoundInterrupts<
      TTools,
      TInterrupts
    >
  }

  /** @deprecated Use getInterrupts(). */
  getPendingInterrupts(): BoundInterrupts<TTools, TInterrupts> {
    return this.interruptManager.getInterrupts() as BoundInterrupts<
      TTools,
      TInterrupts
    >
  }

  resolveInterrupts(approved: boolean): void
  resolveInterrupts(
    resolver: (
      interrupt: ResolvableChatInterrupt<TTools, TInterrupts>,
    ) => undefined,
  ): void
  resolveInterrupts(
    resolution:
      | boolean
      | ((
          interrupt: ResolvableChatInterrupt<TTools, TInterrupts>,
        ) => undefined),
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
    return this.resumeInterruptsUnsafeForGeneration(
      resume,
      target,
      this.continuationGeneration,
    )
  }

  private resumeInterruptsUnsafeForGeneration(
    resume: Array<RunAgentResumeItem>,
    target: ChatResumeState,
    continuationGeneration: number,
  ): Promise<boolean> {
    if (continuationGeneration !== this.continuationGeneration) {
      return Promise.resolve(false)
    }
    if (this.isLoading) {
      return new Promise<boolean>((resolve, reject) => {
        this.queuePostStreamAction(async () => {
          try {
            resolve(
              await this.resumeInterruptsUnsafeForGeneration(
                resume,
                target,
                continuationGeneration,
              ),
            )
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
    const continuationGeneration = this.continuationGeneration
    this.activeInterruptSubmission = submission
    this.interruptSubmissionFailure = undefined
    for (const resolution of submission.resolutions) {
      const approved = readApprovalApproved(resolution.payload)
      if (approved === undefined) continue
      const approvalId = resolution.interruptId
      this.processor.addToolApprovalResponse(approvalId, approved)
    }
    const resumed = await this.resumeInterruptsUnsafeForGeneration(
      [...submission.resolutions],
      {
        threadId: submission.threadId,
        runId: submission.interruptedRunId,
      },
      continuationGeneration,
    ).finally(() => {
      // Only clear if this resume still owns the client: `stop()` may have
      // invalidated it while the submission was settling.
      if (this.activeInterruptSubmission === submission) {
        this.activeInterruptSubmission = undefined
      }
    })
    if (continuationGeneration !== this.continuationGeneration) return
    const failure = this.takeInterruptSubmissionFailure()
    if (failure !== undefined) {
      throw { errors: failure.errors }
    }
    if (!resumed) {
      throw new Error('Interrupt continuation could not be started.')
    }
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

  private notifyResumeStateChange(source: InterruptManagerChangeSource): void {
    const resumeState = this.getResumeState()
    // Capture state before invoking callbacks so a synchronous nested change
    // cannot pair this publication's source with a later manager snapshot.
    const interruptState = this.interruptManager.getState()
    this.persistResumeSnapshot(resumeState)
    this.callbacksRef.current.onResumeStateChange(
      resumeState,
      interruptState.interrupts,
    )
    this.callbacksRef.current.onInterruptStateChange(interruptState, { source })
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
    const client = this
    return {
      get hookId() {
        return client.uniqueId
      },
      get clientId() {
        return client.uniqueId
      },
      get threadId() {
        return client.threadId
      },
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
    const isInFlightRequest =
      this.isLoading ||
      this.status === 'submitted' ||
      this.status === 'streaming'
    if (isInFlightRequest) {
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
        const isNonAbortError =
          err instanceof Error && err.name !== 'AbortError'
        if (isNonAbortError) {
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
        const isLiveSubscription = !signal.aborted && this.isSubscribed
        if (isLiveSubscription) {
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
   * Re-attach to an in-flight run after a full page reload, replaying its stream
   * from the server's delivery-durability log via `joinRun` (which returns the
   * whole run so far, then tails live to completion).
   *
   * The log is the single source of truth for the run, so we rebuild the
   * in-flight assistant bubble from it rather than trying to reconcile the
   * server-hydrated partial with the replay: on the first chunk that actually
   * (re)builds a message we drop the hydrated in-flight assistant, and the
   * replay reconstructs one clean bubble. Dropping only on real content (not on
   * `RUN_STARTED`) means a rejoin that connects but delivers nothing can never
   * leave an empty bubble behind.
   *
   * Bounded connect: a durable backend keeps a from-start join open waiting for
   * a producer, so a stale pointer to an unknown/evicted run would otherwise pin
   * the UI in a loading state for the backend's full first-chunk deadline. We
   * give up after {@link REJOIN_CONNECT_DEADLINE_MS} if no chunk arrives and
   * clear the dead pointer so it does not retry on the next load.
   *
   * Replay chunks are processed WITHOUT the per-chunk yield the live path uses,
   * so the buffered prefix snaps in and only the genuinely-live tail streams at
   * network speed — a reload looks like the run continued, not like it re-typed.
   */
  private resumeInFlightRun(runId: string): void {
    const joinRun = this.connection.joinRun
    if (!joinRun) return
    const controller = new AbortController()
    this.abortController = controller
    this.setCurrentRunId(runId)
    this.lastResume = { threadId: this.threadId, runId }
    this.streamContinuationGeneration = this.continuationGeneration
    this.setIsLoading(true)
    this.setStatus('streaming')
    void this.consumeRejoinStream(controller, runId, joinRun)
  }

  private isRejoinAbortError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    )
  }

  private handleRejoinFailure(error: unknown, attached: boolean): boolean {
    const isAbort = this.isRejoinAbortError(error)
    const isUnreachableRun = !attached && !isAbort
    if (isUnreachableRun) return true
    const isRejoinError = attached && !isAbort
    if (isRejoinError) {
      this.reportStreamError(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
    return false
  }

  private clearDeadRejoinPointer(attached: boolean, refused: boolean): void {
    const shouldKeepResumePointer =
      attached || !refused || !this.tailing || this.disposed
    if (shouldKeepResumePointer) return
    this.lastResume = null
    this.persistor?.persistResumeSnapshot(null)
  }

  private async finishRejoin(controller: AbortController): Promise<void> {
    if (this.abortController !== controller) return
    this.abortController = null
    this.setIsLoading(false)
    if (this.status === 'streaming') this.setStatus('ready')
    await this.drainPostStreamActions()
  }

  private async consumeRejoinStream(
    controller: AbortController,
    runId: string,
    joinRun: (
      runId: string,
      abortSignal?: AbortSignal,
    ) => AsyncIterable<StreamChunk>,
  ): Promise<void> {
    let rebuilt = false
    let attached = false
    let refused = false
    const connectTimer = setTimeout(() => {
      if (!attached) controller.abort()
    }, REJOIN_CONNECT_DEADLINE_MS)
    try {
      const joinChunks = joinRun(runId, controller.signal)
      for await (const chunk of joinChunks) {
        if (controller.signal.aborted) break
        if (!attached) {
          attached = true
          clearTimeout(connectTimer)
        }
        const needsRebuild = !rebuilt && REJOIN_REBUILD_TRIGGERS.has(chunk.type)
        if (needsRebuild) {
          rebuilt = true
          this.dropTrailingInFlightAssistant()
        }
        await this.processIncomingChunk(chunk, { defer: false })
      }
      if (this.pendingToolExecutions.size > 0) {
        await Promise.all(this.pendingToolExecutions.values())
      }
    } catch (error) {
      refused = this.handleRejoinFailure(error, attached)
    } finally {
      clearTimeout(connectTimer)
      this.clearDeadRejoinPointer(attached, refused)
      await this.finishRejoin(controller)
    }
  }

  /**
   * Drop a hydrated, still-in-flight assistant turn so a resume replay can
   * rebuild it cleanly. Only touches a trailing assistant message (the shape a
   * reload-mid-stream leaves); a thread whose last turn is a user message (run
   * never produced, or already settled) is left untouched.
   */
  private dropTrailingInFlightAssistant(): void {
    const messages = this.processor.getMessages()
    const last = messages[messages.length - 1]
    const hasTrailingAssistant = last && last.role === 'assistant'
    if (hasTrailingAssistant) {
      this.processor.setMessages(messages.slice(0, -1))
    }
  }

  private async processIncomingChunk(
    chunk: StreamChunk,
    options?: { defer?: boolean },
  ): Promise<void> {
    chunk = restoreInboundChunk(chunk)
    const isFailedInterruptSubmit =
      chunk.type === 'RUN_ERROR' &&
      this.isActiveInterruptSubmissionFailure(chunk)
    if (isFailedInterruptSubmit) {
      const interruptErrors = tanstackMetadata(chunk)?.interruptErrors
      this.interruptSubmissionFailure = {
        errors: Array.isArray(interruptErrors) ? interruptErrors : [],
      }
    }
    if (this.connectionStatus === 'connecting') {
      this.setConnectionStatus('connected')
    }
    const shouldIgnore = this.clearedStreamTracker.shouldIgnoreChunk(chunk)
    if (shouldIgnore) {
      const isTerminalChunk =
        chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
      if (isTerminalChunk) {
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
    const shouldYieldToPaint =
      options?.defer !== false &&
      (typeof document === 'undefined' || !document.hidden)
    if (shouldYieldToPaint) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    this.resolveJoinedRun(chunk)
  }

  private isActiveInterruptSubmissionFailure(
    chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
  ): boolean {
    const submission = this.activeInterruptSubmission
    const errors = tanstackMetadata(chunk)?.interruptErrors
    if (!submission) {
      return false
    }
    if (!Array.isArray(errors)) {
      return false
    }
    if (errors.length === 0) {
      return false
    }
    const runId = getChunkRunId(chunk)
    const isForeignRun = runId !== undefined && runId !== this.currentRunId
    if (isForeignRun) return false
    if (
      typeof chunk.threadId === 'string' &&
      chunk.threadId !== submission.threadId
    ) {
      return false
    }
    return errors.every((error) => {
      if (
        error == null ||
        typeof error !== 'object' ||
        typeof error.threadId !== 'string' ||
        typeof error.interruptedRunId !== 'string' ||
        typeof error.generation !== 'number'
      ) {
        return false
      }
      return (
        error.threadId === submission.threadId &&
        error.interruptedRunId === submission.interruptedRunId &&
        error.generation === submission.generation
      )
    })
  }

  private resolveJoinedRun(chunk: StreamChunk): void {
    const isTerminalChunk =
      chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
    if (!isTerminalChunk) return
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
    const needsSubscriptionRestart =
      !this.subscriptionAbortController ||
      this.subscriptionAbortController.signal.aborted
    if (needsSubscriptionRestart) {
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
   * @param sendOptions - Per-call overrides. `{ whenBusy }` overrides the
   *                      queue policy for this one send. `{ body }`
   *                      shallow-merges with `body` and with the chat-level
   *                      `body` / `forwardedProps`. `sendOptions.body` wins
   *                      on key collisions. Framework hooks forward this
   *                      object as their second argument.
   *
   * @example
   * ```ts
   * // Simple text message
   * await client.sendMessage('Hello!')
   *
   * // Text message with custom body params
   * await client.sendMessage('Hello!', { temperature: 0.7 })
   *
   * // Per-call whenBusy override
   * await client.sendMessage('Urgent', undefined, { whenBusy: 'interrupt' })
   *
   * // Per-call body via options. Same effect as the positional arg.
   * // This is the shape the framework hooks (`useChat`, `injectChat`) forward.
   * await client.sendMessage('Hello!', undefined, { body: { temperature: 0.7 } })
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

    const resolvedBody = { ...body, ...sendOptions?.body }

    if (this.isSendBusy()) {
      const { action, id } = this.decideWhenBusy(content, sendOptions)
      if (action === 'drop') {
        return
      }
      if (action === 'queue') {
        this.enqueueMessage(content, resolvedBody, id)
        return
      }
      this.stopMessageQueueDrain = true
      this.sendInFlight = true
      this.cancelInFlightStream({ setReadyStatus: true })
      this.resetSessionGenerating()
    } else {
      this.sendInFlight = true
    }

    try {
      await this.deliverMessage(content, resolvedBody)
    } finally {
      this.sendInFlight = false
    }
  }

  /** True while interrupt descriptors still own continuation. */
  private hasPendingInterrupts(): boolean {
    return this.interruptManager.getDescriptors().length > 0
  }

  /** True while an interrupt batch owns the next user turn. */
  private hasBlockingInterrupts(): boolean {
    return (
      this.activeInterruptSubmission !== undefined ||
      this.hasPendingInterrupts()
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
    const isDeliverBusy = this.isLoading || this.deliverClaim
    if (isDeliverBusy) {
      return false
    }
    this.deliverClaim = true
    try {
      const normalizedContent = this.normalizeMessageInput(content)
      this.pendingMessageBody = body
      const userMessage = this.processor.addUserMessage(
        normalizedContent.content,
        normalizedContent.id,
        normalizedContent.metadata,
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
    const isQueueFull =
      maxSize !== undefined && this.messageQueue.length >= maxSize
    if (isQueueFull) {
      // maxSize 0 is a hard cap (never queue). drop-oldest cannot make room.
      const cannotMakeRoom = onOverflow === 'reject' || maxSize === 0
      if (cannotMakeRoom) {
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
   * Normalize the message input to extract content, optional id, and
   * optional metadata. String form has no metadata. Trims string content.
   */
  private normalizeMessageInput(input: string | MultimodalContent): {
    content: string | Array<ContentPart>
    id?: string
    metadata?: Record<string, any>
  } {
    if (typeof input === 'string') {
      return { content: input.trim() }
    }
    return {
      content: input.content,
      id: input.id,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    }
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
    this.streamContinuationGeneration = this.continuationGeneration
    // Native interrupt continuation is a fresh child run. The interrupted run
    // is carried as parentRunId and the complete resolution batch as resume.
    const resumeThreadId = this.pendingResumeThreadId
    const resumeParentRunId = this.pendingResumeParentRunId
    const resumeItems = this.pendingResumeItems
    this.pendingResumeThreadId = null
    this.pendingResumeParentRunId = null
    this.pendingResumeItems = null
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    this.setCurrentRunId(runId)
    this.activeResumeThreadId = resumeThreadId ?? this.threadId
    this.activeResumeRunId = runId

    this.setIsLoading(true)
    this.deliverClaim = false
    this.setStatus('submitted')
    this.setError(undefined)
    this.errorReportedGeneration = null
    this.abortController = new AbortController()
    const signal = this.abortController.signal
    // Reset pending tool executions for the new stream
    this.pendingToolExecutions.clear()
    let streamCompletedSuccessfully = false
    let activeDevtoolsRunId: string | null = null
    let runTerminalEventEmitted = false

    const executeStream = async (): Promise<void> => {
      const messages = this.processor.getMessages()
      const clientTools = new Map(this.clientToolsRef.current)
      const runtimeContext = this.context

      await this.callbacksRef.current.onResponse()

      if (signal.aborted) {
        return
      }

      const mergedBody = {
        ...this.bodyOption,
        ...this.forwardedPropsOption,
        ...this.pendingMessageBody,
      }

      this.pendingMessageBody = undefined
      this.currentStreamId = this.generateUniqueId('stream')
      this.devtoolsBridge.setCurrentStreamId(this.currentStreamId)
      this.currentMessageId = null
      this.activeClientTools = clientTools
      this.activeContext = runtimeContext
      this.processor.prepareAssistantMessage()
      this.ensureSubscription()
      const processingComplete = this.waitForProcessing()

      let byokHeaders: Record<string, string> | undefined
      if (this.byok) {
        const provider = resolveByokProviderId(
          this.byokProvider,
          mergedBody.provider,
        )
        byokHeaders = await prepareResolvedByokHeaders(this.byok, provider)
      }

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
        ...(byokHeaders ? { headers: byokHeaders } : {}),
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

      await this.connection.send(messages, mergedBody, signal, runContext)

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mutated asynchronously during await
      const isStaleStream =
        generation !== this.streamGeneration || signal.aborted
      if (isStaleStream) {
        return
      }

      // connect() send() already drained the subscribe queue. Kick processing
      // so a tool_calls end cannot hang. Sockets still wait for a terminal.
      if (this.connectionDrainsOnSend) {
        this.resolveProcessing()
      }

      await processingComplete

      if (generation !== this.streamGeneration) {
        return
      }

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
        return
      }

      if (this.pendingToolExecutions.size > 0) {
        await Promise.all(this.pendingToolExecutions.values())
      }

      this.processor.finalizeStream()
      streamCompletedSuccessfully = true
    }

    const handleStreamFailure = (err: unknown): void => {
      const error = err instanceof Error ? err : new Error(String(err))
      if (error.name === 'AbortError') {
        if (activeDevtoolsRunId) {
          this.devtoolsBridge.emitRunLifecycle(
            'run:cancelled',
            activeDevtoolsRunId,
            'cancelled',
          )
          runTerminalEventEmitted = true
        }
        return
      }
      if (error instanceof ByokMissingError) {
        this.byok?.request(error.provider, 'missing')
      }
      const isByokLocked =
        error instanceof ByokBlockedError && error.reason === 'locked'
      if (isByokLocked) {
        this.byok?.request(error.provider, 'locked')
      }
      if (generation === this.streamGeneration) {
        this.reportStreamError(error)
        if (activeDevtoolsRunId) {
          this.devtoolsBridge.emitRunLifecycle(
            'run:errored',
            activeDevtoolsRunId,
            'errored',
            { error: error.message },
          )
          runTerminalEventEmitted = true
        }
      }
      const shouldRethrowByok =
        generation === this.streamGeneration &&
        (error instanceof ByokMissingError ||
          error instanceof ByokBlockedError ||
          error instanceof ByokUnresolvedProviderError)
      if (shouldRethrowByok) {
        throw error
      }
    }

    const finishStream = async (): Promise<void> => {
      if (generation !== this.streamGeneration) return
      this.currentStreamId = null
      this.devtoolsBridge.setCurrentStreamId(null)
      this.currentMessageId = null
      this.setCurrentRunId(null)
      this.activeClientTools = null
      this.activeContext = undefined
      this.abortController = null
      this.setIsLoading(false)
      this.pendingMessageBody = undefined

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

      await this.drainPostStreamActions()

      if (!streamCompletedSuccessfully) {
        this.flushQueue()
        return
      }
      if (this.status !== 'ready') {
        this.setStatus('ready')
      }
      if (!this.messageQueueDraining) {
        await this.drainQueue()
      }
    }

    try {
      await executeStream()
    } catch (err: unknown) {
      handleStreamFailure(err)
    } finally {
      await finishStream()
    }

    return streamCompletedSuccessfully
  }

  /**
   * Start the client subscription loop.
   * This controls the connection lifecycle independently from request lifecycle.
   */
  subscribe(options?: { restart?: boolean }): void {
    const restart = options?.restart === true
    const isAlreadySubscribed = this.isSubscribed && !restart
    if (isAlreadySubscribed) {
      return
    }

    const shouldRestartSubscription = this.isSubscribed && restart
    if (shouldRestartSubscription) {
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
    // Invalidate deferred work from the stopped continuation.
    this.continuationGeneration++
    const hadLocalStream = this.abortController !== null
    this.cancelInFlightStream({ setReadyStatus: true })
    this.discardPendingSends()
    this.lastResume = null
    this.activeInterruptSubmission = undefined
    this.interruptManager.reset()
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
    const hasLocalWork = this.isLoading || hadLocalStream
    if (hasLocalWork) {
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
    await this.addToolResultForClientTool(
      result,
      clientTool,
      this.streamContinuationGeneration,
    )
  }

  private async addToolResultForClientTool(
    result: ClientToolResult,
    clientTool: AnyClientTool | undefined,
    continuationGeneration: number,
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

    if (continuationGeneration !== this.continuationGeneration) return

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
      this.queuePostStreamAction(() =>
        continuationGeneration === this.continuationGeneration
          ? this.checkForContinuation()
          : Promise.resolve(),
      )
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
    const continuationGeneration = this.continuationGeneration
    this.postStreamActions.push(async () => {
      if (continuationGeneration !== this.continuationGeneration) return
      await action()
    })
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
    // stop() bumps continuationGeneration without opening a new stream.
    if (this.streamContinuationGeneration !== this.continuationGeneration) {
      return
    }
    if (this.hasPendingInterrupts()) return

    // Prevent duplicate continuation attempts
    const isContinuationBusy = this.continuationPending || this.isLoading
    if (isContinuationBusy) {
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mutated asynchronously during await
      const needsRetryContinuation = this.continuationSkipped && succeeded
      if (needsRetryContinuation) {
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
    // A pending interrupt owns the next send. Auto-continuing after a
    // completed server tool would start a sibling run and hide the card.
    if (this.lastResume) return false
    const isInterruptOwned =
      this.activeInterruptSubmission && this.hasPendingInterrupts()
    if (isInterruptOwned) {
      return false
    }
    if (this.interruptManager.getInterrupts().length > 0) return false
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
    const cannotDrainQueue =
      this.messageQueueDraining ||
      this.isLoading ||
      this.messageQueue.length === 0
    if (cannotDrainQueue) {
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
          const shouldStopDrain =
            !completed || this.shouldAbortMessageQueueDrain()
          if (shouldStopDrain) {
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
        const shouldStopDrain =
          !completed || this.shouldAbortMessageQueueDrain()
        if (shouldStopDrain) {
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
    this.applyConnectionUpdate(options)
    this.applyClientOptionSlots(options)
    this.applyCallbackUpdates(options)
  }

  private applyConnectionUpdate(
    options: ChatClientUpdateOptionsWithoutContext<TTools> & {
      context?: TContext | undefined
    },
  ): void {
    const hasNoTransportUpdate =
      options.connection === undefined && options.fetcher === undefined
    if (hasNoTransportUpdate) {
      return
    }
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
    const transport = resolveTransport({
      connection: options.connection,
      fetcher: options.fetcher,
    })
    this.connectionDrainsOnSend = connectionDrainsOnSend(transport)
    this.connection = normalizeConnectionAdapter(transport)

    if (wasSubscribed) {
      this.subscribe()
    }
  }

  private applyClientOptionSlots(
    options: ChatClientUpdateOptionsWithoutContext<TTools> & {
      context?: TContext | undefined
    },
  ): void {
    if (options.body !== undefined) {
      this.bodyOption = options.body
    }
    if (options.forwardedProps !== undefined) {
      this.forwardedPropsOption = options.forwardedProps
    }
    if (options.byok !== undefined) {
      this.byok = options.byok
    }
    if (options.byokProvider !== undefined) {
      this.byokProvider = options.byokProvider
    }
    if ('context' in options) {
      this.context = options.context
    }
    if (options.tools !== undefined) {
      this.interruptManager.updateTools(options.tools)
      this.clientToolsRef.current = createClientToolsMap(options.tools)
      this.devtoolsBridge.notifyToolsChanged()
    }
    if (options.queue !== undefined) {
      this.queueConfig = normalizeQueueOption(options.queue)
    }
  }

  private applyCallbackUpdates(
    options: ChatClientUpdateOptionsWithoutContext<TTools> & {
      context?: TContext | undefined
    },
  ): void {
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
    if (options.onRunIdChange !== undefined) {
      this.callbacksRef.current.onRunIdChange = options.onRunIdChange
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
    this.disposed = true
    this.unsubscribe()
    this.devtoolsBridge.dispose()
    this.devtoolsMounted = false
  }
}
