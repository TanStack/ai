import {
  StreamProcessor,
  normalizeToUIMessage,
  generateMessageId,
  type ModelMessage,
  type StreamChunk,
  type AnyClientTool,
} from '@tanstack/ai'
import { DefaultChatClientEventEmitter } from './events'
import type {
  ChatClientOptions,
  ToolCallPart,
  UIMessage,
  MessagePart,
} from './types'
import type { ConnectionAdapter } from './connection-adapters'
import type { ChatClientEventEmitter } from './events'

export class ChatClient {
  private processor: StreamProcessor
  private connection: ConnectionAdapter
  private uniqueId: string
  private body?: Record<string, any>
  private isLoading = false
  private error: Error | undefined = undefined
  private abortController: AbortController | null = null
  private events: ChatClientEventEmitter
  private clientTools: Map<string, AnyClientTool>

  private callbacks: {
    onResponse: (response?: Response) => void | Promise<void>
    onChunk: (chunk: StreamChunk) => void
    onFinish: (message: UIMessage) => void
    onError: (error: Error) => void
    onMessagesChange: (messages: Array<UIMessage>) => void
    onLoadingChange: (isLoading: boolean) => void
    onErrorChange: (error: Error | undefined) => void
  }

  constructor(options: ChatClientOptions) {
    this.uniqueId = options.id || this.generateUniqueId('chat')
    this.body = options.body
    this.connection = options.connection
    this.events = new DefaultChatClientEventEmitter(this.uniqueId)

    // Build client tools map
    this.clientTools = new Map()
    if (options.tools) {
      for (const tool of options.tools) {
        this.clientTools.set(tool.name, tool)
      }
    }

    this.callbacks = {
      onResponse: options.onResponse || (() => {}),
      onChunk: options.onChunk || (() => {}),
      onFinish: options.onFinish || (() => {}),
      onError: options.onError || (() => {}),
      onMessagesChange: options.onMessagesChange || (() => {}),
      onLoadingChange: options.onLoadingChange || (() => {}),
      onErrorChange: options.onErrorChange || (() => {}),
    }

    // Create StreamProcessor with event handlers
    this.processor = new StreamProcessor({
      chunkStrategy: options.streamProcessor?.chunkStrategy,
      initialMessages: options.initialMessages,
      events: {
        onMessagesChange: (messages: Array<UIMessage>) => {
          this.callbacks.onMessagesChange(messages)
        },
        onStreamStart: () => {
          // Stream started
        },
        onStreamEnd: (message: UIMessage) => {
          this.callbacks.onFinish(message)
        },
        onError: (error: Error) => {
          this.setError(error)
          this.callbacks.onError(error)
        },
        onToolCall: async (args: {
          toolCallId: string
          toolName: string
          input: any
        }) => {
          // Handle client-side tool execution automatically
          const clientTool = this.clientTools.get(args.toolName)
          if (clientTool?.execute) {
            try {
              const output = await clientTool.execute(args.input)
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
            }
          }
        },
        onApprovalRequest: (args: {
          toolCallId: string
          toolName: string
          input: any
          approvalId: string
        }) => {
          this.events.approvalRequested(
            '', // messageId - we don't track this separately now
            args.toolCallId,
            args.toolName,
            args.input,
            args.approvalId,
          )
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
    this.callbacks.onLoadingChange(isLoading)
    this.events.loadingChanged(isLoading)
  }

  private setError(error: Error | undefined): void {
    this.error = error
    this.callbacks.onErrorChange(error)
    this.events.errorChanged(error?.message || null)
  }

  /**
   * Process a stream through the StreamProcessor
   */
  private async processStream(
    source: AsyncIterable<StreamChunk>,
  ): Promise<UIMessage> {
    // Start a new assistant message
    const messageId = this.processor.startAssistantMessage()

    // Process each chunk
    for await (const chunk of source) {
      this.callbacks.onChunk(chunk)
      this.processor.processChunk(chunk)

      // Yield control back to event loop to allow UI updates
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    // Finalize the stream
    this.processor.finalizeStream()

    // Return the assistant message
    const messages = this.processor.getMessages()
    const assistantMessage = messages.find((m: UIMessage) => m.id === messageId)

    return (
      assistantMessage || {
        id: messageId,
        role: 'assistant',
        parts: [],
        createdAt: new Date(),
      }
    )
  }

  /**
   * Send a message and stream the response
   */
  async sendMessage(content: string): Promise<void> {
    if (!content.trim() || this.isLoading) {
      return
    }

    // Add user message via processor
    const userMessage = this.processor.addUserMessage(content.trim())
    this.events.messageSent(userMessage.id, content.trim())

    await this.streamResponse()
  }

  /**
   * Append a message and stream the response
   */
  async append(message: UIMessage | ModelMessage): Promise<void> {
    // Normalize the message to ensure it has id and createdAt
    const normalizedMessage = normalizeToUIMessage(message, generateMessageId)

    // Emit message appended event
    this.events.messageAppended(normalizedMessage)

    // Add to messages
    const messages = this.processor.getMessages()
    this.processor.setMessages([...messages, normalizedMessage])

    await this.streamResponse()
  }

  /**
   * Stream a response from the LLM
   */
  private async streamResponse(): Promise<void> {
    this.setIsLoading(true)
    this.setError(undefined)
    this.abortController = new AbortController()

    try {
      // Get model messages for the LLM
      const modelMessages = this.processor.toModelMessages()

      // Call onResponse callback
      await this.callbacks.onResponse()

      // Connect and stream
      const stream = this.connection.connect(
        modelMessages,
        this.body,
        this.abortController.signal,
      )

      await this.processStream(stream)
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          return
        }
        this.setError(err)
        this.callbacks.onError(err)
      }
    } finally {
      this.abortController = null
      this.setIsLoading(false)
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

    // Check if we should auto-send
    if (this.shouldAutoSend()) {
      await this.continueFlow()
    }
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

    // Check if we should auto-send
    if (this.shouldAutoSend()) {
      await this.continueFlow()
    }
  }

  /**
   * Continue the agent flow with current messages
   */
  private async continueFlow(): Promise<void> {
    if (this.isLoading) return
    await this.streamResponse()
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
}
