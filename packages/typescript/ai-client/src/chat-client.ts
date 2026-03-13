import {
  StreamProcessor,
  generateMessageId,
  normalizeToUIMessage,
} from '@tanstack/ai'
import { DefaultChatClientEventEmitter } from './events'
import { normalizeConnectionAdapter } from './connection-adapters'
import type {
  AnyClientTool,
  ContentPart,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'
import type {
  ConnectionAdapter,
  SubscribeConnectionAdapter,
} from './connection-adapters'
import type { ChatClientEventEmitter } from './events'
import type {
  ChatClientOptions,
  ChatClientState,
  ConnectionStatus,
  MessagePart,
  MultimodalContent,
  ToolCallPart,
  UIMessage,
} from './types'

export class ChatClient {
  private processor: StreamProcessor
  private connection: SubscribeConnectionAdapter
  private uniqueId: string
  private body: Record<string, any> = {}
  private pendingMessageBody: Record<string, any> | undefined = undefined
  private isLoading = false
  private isSubscribed = false
  private error: Error | undefined = undefined
  private status: ChatClientState = 'ready'
  private connectionStatus: ConnectionStatus = 'disconnected'
  private abortController: AbortController | null = null
  private events: ChatClientEventEmitter
  private clientToolsRef: { current: Map<string, AnyClientTool> }
  private currentStreamId: string | null = null
  private currentMessageId: string | null = null
  private postStreamActions: Array<() => Promise<void>> = []
  // Track pending client tool executions to await them before stream finalization
  private pendingToolExecutions: Map<string, Promise<void>> = new Map()
  // Flag to deduplicate continuation checks during action draining
  private continuationPending = false
  private subscriptionAbortController: AbortController | null = null
  private processingResolve: (() => void) | null = null
  private errorReportedGeneration: number | null = null
  private streamGeneration = 0
  // Tracks whether a queued checkForContinuation was skipped because
  // continuationPending was true (chained approval scenario)
  private continuationSkipped = false
  private sessionGenerating = false
  private activeRunIds = new Set<string>()

  private callbacksRef: {
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
      onCustomEvent: (
        eventType: string,
        data: unknown,
        context: { toolCallId?: string },
      ) => void
    }
  }

  constructor(options: ChatClientOptions) {
    this.uniqueId = options.id || this.generateUniqueId('chat')
    this.body = options.body || {}
    this.connection = normalizeConnectionAdapter(options.connection)
    this.events = new DefaultChatClientEventEmitter(this.uniqueId)

    // Build client tools map
    this.clientToolsRef = { current: new Map() }
    if (options.tools) {
      for (const tool of options.tools) {
        this.clientToolsRef.current.set(tool.name, tool)
      }
    }

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
        onConnectionStatusChange: options.onConnectionStatusChange || (() => {}),
        onSessionGeneratingChange: options.onSessionGeneratingChange || (() => {}),
        onCustomEvent: options.onCustomEvent || (() => {}),
      },
    }

    // Create StreamProcessor with event handlers
    this.processor = new StreamProcessor({
      chunkStrategy: options.streamProcessor?.chunkStrategy,
      initialMessages: options.initialMessages,
      events: {
        onMessagesChange: (messages: Array<UIMessage>) => {
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
            )
          }
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
          const clientTool = this.clientToolsRef.current.get(args.toolName)
          const executeFunc = clientTool?.execute
          if (executeFunc) {
            // Create and track the execution promise
            const executionPromise = (async () => {
              try {
                const output = await executeFunc(args.input)
                await this.addToolResult({
                  toolCallId: args.toolCallId,
                  tool: args.toolName,
                  output,
                  state: 'output-available',
                })
              } catch (error: any) {
                await this.addToolResult({
                  toolCallId: args.toolCallId,
                  tool: args.toolName,
                  output: null,
                  state: 'output-error',
                  errorText: error.message,
                })
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
          if (this.currentStreamId) {
            this.events.approvalRequested(
              this.currentStreamId,
              this.currentMessageId || '',
              args.toolCallId,
              args.toolName,
              args.input,
              args.approvalId,
            )
          }
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

    this.events.clientCreated(this.processor.getMessages().length)
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
  }

  private setIsSubscribed(isSubscribed: boolean): void {
    this.isSubscribed = isSubscribed
    this.callbacksRef.current.onSubscriptionChange(isSubscribed)
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status
    this.callbacksRef.current.onConnectionStatusChange(status)
  }

  private setSessionGenerating(isGenerating: boolean): void {
    if (this.sessionGenerating === isGenerating) return
    this.sessionGenerating = isGenerating
    this.callbacksRef.current.onSessionGeneratingChange(isGenerating)
  }

  private resetSessionGenerating(): void {
    this.activeRunIds.clear()
    this.setSessionGenerating(false)
  }

  private setError(error: Error | undefined): void {
    this.error = error
    this.callbacksRef.current.onErrorChange(error)
    this.events.errorChanged(error?.message || null)
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

    this.consumeSubscription(signal).catch((err) => {
      if (err instanceof Error && err.name !== 'AbortError') {
        this.setConnectionStatus('error')
        this.resetSessionGenerating()
        this.setIsSubscribed(false)
        this.reportStreamError(err)
      }
      // Resolve pending processing so streamResponse doesn't hang
      this.resolveProcessing()
    }).finally(() => {
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
      this.callbacksRef.current.onChunk(chunk)
      this.processor.processChunk(chunk)
      if (chunk.type === 'RUN_STARTED') {
        this.activeRunIds.add(chunk.runId)
        this.setSessionGenerating(true)
      }
      // RUN_FINISHED / RUN_ERROR signal run completion — resolve processing
      // (redundant if onStreamEnd already resolved it, harmless)
      if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
        if (chunk.runId) {
          this.activeRunIds.delete(chunk.runId)
        } else if (chunk.type === 'RUN_ERROR') {
          // RUN_ERROR without runId is a session-level error; clear all runs
          this.activeRunIds.clear()
        }
        this.setSessionGenerating(this.activeRunIds.size > 0)
        this.resolveProcessing()
      }
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
   *
   * @example
   * ```ts
   * // Simple text message
   * await client.sendMessage('Hello!')
   *
   * // Text message with custom body params
   * await client.sendMessage('Hello!', { temperature: 0.7 })
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
  ): Promise<void> {
    const emptyMessage = typeof content === 'string' && !content.trim()
    if (emptyMessage || this.isLoading) {
      return
    }
    // Normalize input to extract content, id, and validate
    const normalizedContent = this.normalizeMessageInput(content)

    // Store the per-message body for use in streamResponse
    this.pendingMessageBody = body

    // Add user message via processor
    const userMessage = this.processor.addUserMessage(
      normalizedContent.content,
      normalizedContent.id,
    )
    this.events.messageSent(userMessage.id, normalizedContent.content)

    await this.streamResponse()
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

    this.setIsLoading(true)
    this.setStatus('submitted')
    this.setError(undefined)
    this.errorReportedGeneration = null
    this.abortController = new AbortController()
    // Reset pending tool executions for the new stream
    this.pendingToolExecutions.clear()
    let streamCompletedSuccessfully = false

    try {
      // Get UIMessages with parts (preserves approval state and client tool results)
      const messages = this.processor.getMessages()

      // Call onResponse callback
      await this.callbacksRef.current.onResponse()

      // Merge body: base body + per-message body (per-message takes priority)
      // Include conversationId for server-side event correlation
      const mergedBody = {
        ...this.body,
        ...this.pendingMessageBody,
        conversationId: this.uniqueId,
      }

      // Clear the pending message body after use
      this.pendingMessageBody = undefined

      // Generate stream ID — assistant message will be created by stream events
      this.currentStreamId = this.generateUniqueId('stream')
      this.currentMessageId = null

      // Reset processor stream state for new response — prevents stale
      // messageStates entries (from a previous stream) from blocking
      // creation of a new assistant message (e.g. after reload).
      this.processor.prepareAssistantMessage()

      // Ensure subscription loop is running
      this.ensureSubscription()

      // Set up promise that resolves when onStreamEnd fires
      const processingComplete = this.waitForProcessing()

      // Send through normalized connection (pushes chunks to subscription queue)
      await this.connection.send(
        messages,
        mergedBody,
        this.abortController.signal,
      )

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
          return false
        }
        if (generation === this.streamGeneration) {
          this.reportStreamError(err)
        }
      }
    } finally {
      // Only clean up if this is still the active stream.
      // A superseded stream (e.g. reload() started a new one) must not
      // clobber the new stream's abortController or isLoading state.
      if (generation === this.streamGeneration) {
        this.currentStreamId = null
        this.currentMessageId = null
        this.abortController = null
        this.setIsLoading(false)
        this.pendingMessageBody = undefined // Ensure it's cleared even on error

        // Drain any actions that were queued while the stream was in progress
        await this.drainPostStreamActions()

        // Continue conversation if the stream ended with a tool result (server tool completed)
        if (streamCompletedSuccessfully) {
          const messages = this.processor.getMessages()
          const lastPart = messages.at(-1)?.parts.at(-1)

          if (lastPart?.type === 'tool-result' && this.shouldAutoSend()) {
            try {
              await this.checkForContinuation()
            } catch (error) {
              console.error('Failed to continue flow after tool result:', error)
            }
          }
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
      (m: UIMessage) => m.role === 'user',
    )

    if (lastUserMessageIndex === -1) return

    // Cancel any active stream before reloading
    if (this.isLoading) {
      this.cancelInFlightStream()
    }

    this.events.reloaded(lastUserMessageIndex)

    // Remove all messages after the last user message
    this.processor.removeMessagesAfter(lastUserMessageIndex)

    // Resend
    await this.streamResponse()
  }

  /**
   * Stop the current stream
   */
  stop(): void {
    this.cancelInFlightStream({ setReadyStatus: true })
    this.events.stopped()
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.processor.clearMessages()
    this.setError(undefined)
    this.events.messagesCleared()
  }

  /**
   * Add the result of a client-side tool execution
   */
  async addToolResult(result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }): Promise<void> {
    this.events.toolResultAdded(
      result.toolCallId,
      result.tool,
      result.output,
      result.state || 'output-available',
    )

    // Add result via processor
    this.processor.addToolResult(
      result.toolCallId,
      result.output,
      result.errorText,
    )

    // If stream is in progress, queue continuation check for after it ends
    if (this.isLoading) {
      this.queuePostStreamAction(() => this.checkForContinuation())
      return
    }

    await this.checkForContinuation()
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
    while (this.postStreamActions.length > 0) {
      const action = this.postStreamActions.shift()!
      await action()
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
   * Check if all tool calls are complete and we should auto-send
   */
  private shouldAutoSend(): boolean {
    return this.processor.areAllToolsComplete()
  }

  /**
   * Get current messages
   */
  getMessages(): Array<UIMessage> {
    return this.processor.getMessages()
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
  setMessagesManually(messages: Array<UIMessage>): void {
    this.processor.setMessages(messages)
  }

  /**
   * Update options refs (for use in React hooks to avoid recreating client)
   */
  updateOptions(options: {
    connection?: ConnectionAdapter
    body?: Record<string, any>
    tools?: ReadonlyArray<AnyClientTool>
    onResponse?: (response?: Response) => void | Promise<void>
    onChunk?: (chunk: StreamChunk) => void
    onFinish?: (message: UIMessage) => void
    onError?: (error: Error) => void
    onSubscriptionChange?: (isSubscribed: boolean) => void
    onConnectionStatusChange?: (status: ConnectionStatus) => void
    onSessionGeneratingChange?: (isGenerating: boolean) => void
    onCustomEvent?: (
      eventType: string,
      data: unknown,
      context: { toolCallId?: string },
    ) => void
  }): void {
    if (options.connection !== undefined) {
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
      this.connection = normalizeConnectionAdapter(options.connection)

      if (wasSubscribed) {
        this.subscribe()
      }
    }
    if (options.body !== undefined) {
      this.body = options.body
    }
    if (options.tools !== undefined) {
      this.clientToolsRef.current = new Map()
      for (const tool of options.tools) {
        this.clientToolsRef.current.set(tool.name, tool)
      }
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
      this.callbacksRef.current.onSubscriptionChange = options.onSubscriptionChange
    }
    if (options.onConnectionStatusChange !== undefined) {
      this.callbacksRef.current.onConnectionStatusChange =
        options.onConnectionStatusChange
    }
    if (options.onSessionGeneratingChange !== undefined) {
      this.callbacksRef.current.onSessionGeneratingChange =
        options.onSessionGeneratingChange
    }
    if (options.onCustomEvent !== undefined) {
      this.callbacksRef.current.onCustomEvent = options.onCustomEvent
    }
  }
}
