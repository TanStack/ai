import {
  StreamProcessor,
  generateMessageId,
  normalizeToUIMessage,
} from '@tanstack/ai'
import { DefaultChatClientEventEmitter } from './events'
import type {
  AnyClientTool,
  ContentPart,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'
import type { ConnectionAdapter } from './connection-adapters'
import type { ChatClientEventEmitter } from './events'
import type {
  ChatClientOptions,
  ChatClientState,
  MessagePart,
  MultimodalContent,
  ToolCallPart,
  UIMessage,
} from './types'

export class ChatClient {
  private processor: StreamProcessor
  private connection: ConnectionAdapter
  private uniqueId: string
  private body: Record<string, any> = {}
  private pendingMessageBody: Record<string, any> | undefined = undefined
  private isLoading = false
  private error: Error | undefined = undefined
  private status: ChatClientState = 'ready'
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
    }
  }

  constructor(options: ChatClientOptions) {
    this.uniqueId = options.id || this.generateUniqueId('chat')
    this.body = options.body || {}
    this.connection = options.connection
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
        },
        onStreamEnd: (message: UIMessage) => {
          this.callbacksRef.current.onFinish(message)
          this.setStatus('ready')
        },
        onError: (error: Error) => {
          this.setError(error)
          this.setStatus('error')
          this.callbacksRef.current.onError(error)
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

  private setError(error: Error | undefined): void {
    this.error = error
    this.callbacksRef.current.onErrorChange(error)
    this.events.errorChanged(error?.message || null)
  }

  /**
   * Process a stream through the StreamProcessor
   */
  private async processStream(
    source: AsyncIterable<StreamChunk>,
  ): Promise<UIMessage | null> {
    // Generate a stream ID for this streaming operation
    this.currentStreamId = this.generateUniqueId('stream')

    // Prepare for a new assistant message (created lazily on first content)
    this.processor.prepareAssistantMessage()

    // Process each chunk
    for await (const chunk of source) {
      this.callbacksRef.current.onChunk(chunk)
      this.processor.processChunk(chunk)

      // Track the message ID once the processor lazily creates it
      if (!this.currentMessageId) {
        const newMessageId =
          this.processor.getCurrentAssistantMessageId() ?? null
        if (newMessageId) {
          this.currentMessageId = newMessageId
          // Emit message appended event now that the assistant message exists
          const assistantMessage = this.processor
            .getMessages()
            .find((m: UIMessage) => m.id === newMessageId)
          if (assistantMessage) {
            this.events.messageAppended(
              assistantMessage,
              this.currentStreamId || undefined,
            )
          }
        }
      }

      // Yield control back to event loop to allow UI updates
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    // Wait for all pending tool executions to complete before finalizing
    // This ensures client tools finish before we check for continuation
    if (this.pendingToolExecutions.size > 0) {
      await Promise.all(this.pendingToolExecutions.values())
    }

    // Finalize the stream
    this.processor.finalizeStream()

    // Get the message ID (may be null if no content arrived)
    const messageId = this.processor.getCurrentAssistantMessageId()

    // Clear the current stream and message IDs
    this.currentStreamId = null
    this.currentMessageId = null

    // Return the assistant message if one was created
    if (messageId) {
      const messages = this.processor.getMessages()
      return messages.find((m: UIMessage) => m.id === messageId) || null
    }

    return null
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
      this.queuePostStreamAction(() => this.streamResponse())
      return
    }

    await this.streamResponse()
  }

  /**
   * Stream a response from the LLM
   */
  private async streamResponse(): Promise<void> {
    // Guard against concurrent streams - if already loading, skip
    if (this.isLoading) {
      return
    }

    this.setIsLoading(true)
    this.setStatus('submitted')
    this.setError(undefined)
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

      // Connect and stream
      const stream = this.connection.connect(
        messages,
        mergedBody,
        this.abortController.signal,
      )

      await this.processStream(stream)
      streamCompletedSuccessfully = true
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          return
        }
        this.setError(err)
        this.setStatus('error')
        this.callbacksRef.current.onError(err)
      }
    } finally {
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
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.setIsLoading(false)
    this.setStatus('ready')
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
      return
    }

    if (this.shouldAutoSend()) {
      this.continuationPending = true
      try {
        await this.streamResponse()
      } finally {
        this.continuationPending = false
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
  }): void {
    if (options.connection !== undefined) {
      this.connection = options.connection
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
  }
}
