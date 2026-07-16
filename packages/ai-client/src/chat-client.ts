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
import type {
  AnyClientTool,
  ContentPart,
  ModelMessage,
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
  ChatClientOptions,
  ChatClientState,
  ChatFetcher,
  ConnectionStatus,
  MessagePart,
  MultimodalContent,
  QueueOption,
  QueueStrategy,
  QueuedMessage,
  SendMessageOptions,
  ToolCallPart,
  UIMessage,
  WhenBusy,
} from './types'

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
function mergeQueuedMessages(
  items: Array<QueuedMessage & { body?: Record<string, any> }>,
): { content: string | MultimodalContent; body?: Record<string, any> } {
  const body = items.at(-1)?.body
  const allString = items.every((i) => typeof i.content === 'string')
  if (allString) {
    return {
      content: items.map((i) => i.content as string).join('\n'),
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

export class ChatClient<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = unknown,
> {
  private readonly processor: StreamProcessor
  private connection: SubscribeConnectionAdapter
  private readonly uniqueId: string
  private readonly threadId: string
  // All persistence concerns (hydrate / save / clear, plus suppression of late
  // chunks after a mid-stream clear) live in ChatPersistor so this class stays
  // focused on streaming. Undefined when no `persistence` adapter is configured.
  private readonly persistor?: ChatPersistor
  private currentRunId: string | null = null
  // Track the legacy `body` option and the canonical `forwardedProps`
  // option as separate slots so that `updateOptions({ forwardedProps })`
  // doesn't wipe a previously-set `body` (and vice versa). They are
  // merged on every send, with `forwardedProps` winning on key collision.
  private bodyOption: Record<string, any> = {}
  private forwardedPropsOption: Record<string, any> = {}
  private context: TContext | undefined = undefined
  private pendingMessageBody: Record<string, any> | undefined = undefined
  private queueConfig: NormalizedQueueConfig
  private messageQueue: Array<QueuedMessage & { body?: Record<string, any> }> =
    []
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
   * `whenBusy` (default: enqueue).
   */
  private messageQueueDraining = false
  /**
   * Set by `whenBusy: 'interrupt'` so an in-progress FIFO drain loop stops
   * before starting the next queued item (the interrupting send owns the client).
   */
  private stopMessageQueueDrain = false
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
      this.persistor = new ChatPersistor(
        options.persistence,
        this.uniqueId,
        (messages) => this.processor.setMessages(messages),
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
        onCustomEvent: options.onCustomEvent || (() => {}),
      },
    }

    // Create StreamProcessor with event handlers.
    // Use conditional spreads so we don't pass `undefined` into
    // `StreamProcessorOptions` fields under `exactOptionalPropertyTypes`.
    const persistedMessages = this.persistor?.readInitial()
    const initialMessages = Array.isArray(persistedMessages)
      ? persistedMessages
      : options.initialMessages

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

    this.persistor?.hydrateAsync(persistedMessages)
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
    const runId = this.persistor?.takeRunlessRunId()
    if (!runId) return
    this.activeRunIds.delete(runId)
    this.setSessionGenerating(this.activeRunIds.size > 0)
    this.resolveProcessing()
  }

  private updateRunLifecycle(
    chunk: StreamChunk,
    options?: { resolveProcessing?: boolean },
  ): void {
    if (chunk.type === 'RUN_STARTED') {
      const chunkRunId = getChunkRunId(chunk) ?? chunk.runId
      this.activeRunIds.add(chunkRunId)
      this.persistor?.onRunStarted(chunkRunId)
      this.setSessionGenerating(true)
      return
    }

    if (chunk.type !== 'RUN_FINISHED' && chunk.type !== 'RUN_ERROR') {
      return
    }

    const runId = getChunkRunId(chunk)
    if (runId) {
      this.activeRunIds.delete(runId)
      this.persistor?.onRunSettled(runId)
    } else if (chunk.type === 'RUN_ERROR') {
      // RUN_ERROR without runId is a session-level error; clear all runs.
      this.activeRunIds.clear()
      this.persistor?.onSessionRunError()
    }
    this.setSessionGenerating(this.activeRunIds.size > 0)
    if (options?.resolveProcessing !== false) {
      this.resolveProcessing()
    }
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

  private resetSessionGenerating(): void {
    this.activeRunIds.clear()
    this.persistor?.resetIgnored()
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
      if (this.connectionStatus === 'connecting') {
        this.setConnectionStatus('connected')
      }
      const shouldIgnore = this.persistor?.shouldIgnoreChunk(chunk) ?? false
      if (shouldIgnore) {
        if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
          if (getChunkRunId(chunk)) {
            this.updateRunLifecycle(chunk, { resolveProcessing: false })
          } else {
            this.drainIgnoredRunlessChunk(chunk)
          }
        }
        continue
      }
      this.callbacksRef.current.onChunk(chunk)
      this.devtoolsBridge.observeChunk(chunk)
      this.processor.processChunk(chunk)
      // Run lifecycle (active-run tracking, session-generating state, and
      // processing resolution for RUN_FINISHED / RUN_ERROR) is handled in a
      // single place so the ignored-chunk path above and this path can't
      // diverge. RUN_ERROR carries its runId via the AG-UI passthrough so a
      // per-run error only clears that run, while a runId-less RUN_ERROR is
      // treated as a session-level error that clears every active run.
      this.updateRunLifecycle(chunk)
      // Yield control back to event loop for UI updates
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
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
   *   { model: 'gpt-4-audio' }
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

    if (this.isSendBusy()) {
      const { action, id } = this.decideWhenBusy(content, sendOptions)
      if (action === 'drop') {
        return
      }
      if (action === 'enqueue') {
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
      try {
        await this.deliverMessage(content, body)
      } finally {
        this.sendInFlight = false
      }
      return
    }

    this.sendInFlight = true
    try {
      await this.deliverMessage(content, body)
    } finally {
      this.sendInFlight = false
    }
  }

  /** True while a stream is active, a send is claiming the client, or the queue is draining. */
  private isSendBusy(): boolean {
    return this.isLoading || this.sendInFlight || this.messageQueueDraining
  }

  /**
   * Append a user message and run the stream. Used by both direct sends and
   * queue drains — callers are responsible for busy/queue policy.
   */
  private async deliverMessage(
    content: string | MultimodalContent,
    body?: Record<string, any>,
  ): Promise<boolean> {
    const normalizedContent = this.normalizeMessageInput(content)
    this.pendingMessageBody = body
    const userMessage = this.processor.addUserMessage(
      normalizedContent.content,
      normalizedContent.id,
    )
    this.events.messageSent(userMessage.id, normalizedContent.content)
    return await this.streamResponse()
  }

  /**
   * Resolve the effective action for a send that arrives while busy.
   * A strategy that returns `'send'` while streaming is coerced to
   * `'enqueue'` — you cannot start a second concurrent stream.
   * The returned `id` is the id that will be stored if the action is enqueue.
   */
  private decideWhenBusy(
    content: string | MultimodalContent,
    sendOptions?: SendMessageOptions,
  ): { action: 'drop' | 'enqueue' | 'interrupt'; id: string } {
    const id = this.generateUniqueId('queued')
    if (sendOptions?.whenBusy) {
      return {
        action:
          sendOptions.whenBusy === 'queue' ? 'enqueue' : sendOptions.whenBusy,
        id,
      }
    }
    const { strategy, whenBusy } = this.queueConfig
    if (strategy) {
      const { action } = strategy({
        pending: {
          id,
          content,
          createdAt: Date.now(),
        },
        isStreaming: true,
        queued: this.getQueue(),
      })
      return {
        action: action === 'send' ? 'enqueue' : action,
        id,
      }
    }
    return {
      action: whenBusy === 'queue' ? 'enqueue' : whenBusy,
      id,
    }
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
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    this.currentRunId = runId

    this.setIsLoading(true)
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
        threadId: this.threadId,
        runId,
        clientTools: Array.from(clientTools.values()).map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema
            ? convertSchemaToJsonSchema(t.inputSchema)
            : { type: 'object' },
        })),
        forwardedProps: { ...mergedBody },
      }
      this.devtoolsBridge.beginRun(runContext.runId, this.threadId)
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
              // leave queued user messages stranded forever.
              if (!this.isLoading) {
                await this.drainQueue()
              }
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
    this.sendInFlight = false
    this.flushQueue()
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
    this.sendInFlight = false
    // Discard pending follow-ups so "regenerate last answer" does not also
    // auto-send messages that were typed during the previous stream.
    this.flushQueue()

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
    this.sendInFlight = false
    this.flushQueue()
    if (hadLocalStream) {
      this.resetSessionGenerating()
    }
    this.events.stopped()
  }

  /**
   * Clear all messages
   */
  clear(): void {
    if (this.persistor) {
      this.persistor.snapshotClear({
        messages: this.processor.getMessages(),
        activeRunIds: this.activeRunIds,
        currentRunId: this.currentRunId,
      })
      if (this.isLoading) {
        this.cancelInFlightStream({ setReadyStatus: true })
        this.resetSessionGenerating()
      } else if (this.activeRunIds.size > 0) {
        this.resetSessionGenerating()
      }
      // Suppress persisting the empty snapshot that clearMessages emits, then
      // remove the stored conversation outright.
      this.persistor.beginClear()
    }
    this.processor.clearMessages()
    this.sendInFlight = false
    this.flushQueue()
    this.persistor?.remove()
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

    // Forward an error message only for output-error results (with a fallback so
    // a message-less `throw new Error()` still reaches the terminal 'error'
    // state); a stray errorText on a successful result must not signal an error.
    this.processor.addToolResult(
      result.toolCallId,
      result.output,
      result.state === 'output-error'
        ? result.errorText || 'Tool execution failed'
        : undefined,
    )

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
   * Deliver queued messages after a successful settle.
   * - `batch`: merge everything currently queued into one send.
   * - `fifo`: walk the queue in a loop, one stream at a time, until empty
   *   (or until another send claims the client via interrupt).
   *
   * Uses `deliverMessage` directly so drains do not re-enter `sendMessage`'s
   * busy/queue policy (which would re-enqueue items and strand the rest).
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
        const items = this.messageQueue.splice(0)
        this.emitQueueChange()
        if (items.length > 0) {
          const merged = mergeQueuedMessages(items)
          await this.deliverMessage(merged.content, merged.body)
        }
        return
      }

      while (this.messageQueue.length > 0) {
        // Interrupt (or a new direct send) claimed the client — stop draining;
        // remaining items stay queued and will drain after that send settles.
        if (this.isLoading || this.stopMessageQueueDrain) {
          return
        }
        const next = this.messageQueue.shift()
        this.emitQueueChange()
        if (!next) {
          return
        }
        const completed = await this.deliverMessage(next.content, next.body)
        // Failed/aborted deliver flushes the rest of the queue in streamResponse.
        if (!completed || this.stopMessageQueueDrain) {
          return
        }
      }
    } finally {
      this.messageQueueDraining = false
      this.stopMessageQueueDrain = false
    }
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
