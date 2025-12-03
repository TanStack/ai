/**
 * Unified Stream Processor
 *
 * Core stream processing engine that manages the full UIMessage[] conversation.
 * Single source of truth for message state.
 *
 * Handles:
 * - Full conversation management (UIMessage[])
 * - Text content accumulation with configurable chunking strategies
 * - Parallel tool calls with lifecycle state tracking
 * - Tool results and approval flows
 * - Thinking/reasoning content
 * - Recording/replay for testing
 * - Event-driven architecture for UI updates
 */
import {
  generateMessageId,
  uiMessageToModelMessages,
} from '../message-converters'
import { defaultJSONParser } from './json-parser'
import {
  updateTextPart,
  updateThinkingPart,
  updateToolCallApproval,
  updateToolCallApprovalResponse,
  updateToolCallPart,
  updateToolCallWithOutput,
  updateToolResultPart,
} from './message-updaters'
import { ImmediateStrategy } from './strategies'
import type {
  ChunkRecording,
  ChunkStrategy,
  InternalToolCallState,
  ProcessorResult,
  ProcessorState,
  ToolCallState,
  ToolResultState,
} from './types'
import type {
  ModelMessage,
  StreamChunk,
  ToolCall,
  ToolCallPart,
  UIMessage,
} from '../types'

/**
 * Events emitted by the StreamProcessor
 */
export interface StreamProcessorEvents {
  // State events - full array on any change
  onMessagesChange?: (messages: Array<UIMessage>) => void

  // Lifecycle events
  onStreamStart?: () => void
  onStreamEnd?: (message: UIMessage) => void
  onError?: (error: Error) => void

  // Interaction events - client must handle these
  onToolCall?: (args: {
    toolCallId: string
    toolName: string
    input: any
  }) => void
  onApprovalRequest?: (args: {
    toolCallId: string
    toolName: string
    input: any
    approvalId: string
  }) => void

  // Granular events for UI optimization (character-by-character, state tracking)
  onTextUpdate?: (messageId: string, content: string) => void
  onToolCallStateChange?: (
    messageId: string,
    toolCallId: string,
    state: ToolCallState,
    args: string,
  ) => void
  onThinkingUpdate?: (messageId: string, content: string) => void
}

/**
 * Legacy handlers for backward compatibility
 * These are the old callback-style handlers
 */
export interface StreamProcessorHandlers {
  onTextUpdate?: (content: string) => void
  onThinkingUpdate?: (content: string) => void

  // Tool call lifecycle handlers
  onToolCallStart?: (index: number, id: string, name: string) => void
  onToolCallDelta?: (index: number, args: string) => void
  onToolCallComplete?: (
    index: number,
    id: string,
    name: string,
    args: string,
  ) => void
  onToolCallStateChange?: (
    index: number,
    id: string,
    name: string,
    state: ToolCallState,
    args: string,
    parsedArgs?: any,
  ) => void

  // Tool result handlers
  onToolResultStateChange?: (
    toolCallId: string,
    content: string,
    state: ToolResultState,
    error?: string,
  ) => void

  // Approval/client tool handlers
  onApprovalRequested?: (
    toolCallId: string,
    toolName: string,
    input: any,
    approvalId: string,
  ) => void
  onToolInputAvailable?: (
    toolCallId: string,
    toolName: string,
    input: any,
  ) => void

  // Stream lifecycle
  onStreamEnd?: (content: string, toolCalls?: Array<ToolCall>) => void
  onError?: (error: { message: string; code?: string }) => void
}

/**
 * Options for StreamProcessor
 */
export interface StreamProcessorOptions {
  chunkStrategy?: ChunkStrategy
  /** New event-driven handlers */
  events?: StreamProcessorEvents
  /** Legacy callback handlers (for backward compatibility) */
  handlers?: StreamProcessorHandlers
  jsonParser?: {
    parse: (jsonString: string) => any
  }
  /** Enable recording for replay testing */
  recording?: boolean
  /** Initial messages to populate the processor */
  initialMessages?: Array<UIMessage>
}

/**
 * StreamProcessor - State machine for processing AI response streams
 *
 * Manages the full UIMessage[] conversation and emits events on changes.
 *
 * State tracking:
 * - Full message array
 * - Current assistant message being streamed
 * - Text content accumulation
 * - Multiple parallel tool calls
 * - Tool call completion detection
 *
 * Tool call completion is detected when:
 * 1. A new tool call starts at a different index
 * 2. Text content arrives
 * 3. Stream ends
 */
export class StreamProcessor {
  private chunkStrategy: ChunkStrategy
  private events: StreamProcessorEvents
  private handlers: StreamProcessorHandlers
  private jsonParser: { parse: (jsonString: string) => any }
  private recordingEnabled: boolean

  // Message state
  private messages: Array<UIMessage> = []
  private currentAssistantMessageId: string | null = null

  // Stream state for current assistant message
  // Total accumulated text across all segments (for the final result)
  private totalTextContent = ''
  // Current segment's text content (for onTextUpdate callbacks)
  private currentSegmentText = ''
  private lastEmittedText = ''
  private thinkingContent = ''
  private toolCalls: Map<string, InternalToolCallState> = new Map()
  private toolCallOrder: Array<string> = []
  private finishReason: string | null = null
  private isDone = false
  // Track if we've had tool calls since the last text segment started
  private hasToolCallsSinceTextStart = false

  // Recording
  private recording: ChunkRecording | null = null
  private recordingStartTime = 0

  constructor(options: StreamProcessorOptions = {}) {
    this.chunkStrategy = options.chunkStrategy || new ImmediateStrategy()
    this.events = options.events || {}
    this.handlers = options.handlers || {}
    this.jsonParser = options.jsonParser || defaultJSONParser
    this.recordingEnabled = options.recording ?? false

    // Initialize with provided messages
    if (options.initialMessages) {
      this.messages = [...options.initialMessages]
    }
  }

  // ============================================
  // Message Management Methods
  // ============================================

  /**
   * Set the messages array (e.g., from persisted state)
   */
  setMessages(messages: Array<UIMessage>): void {
    this.messages = [...messages]
    this.emitMessagesChange()
  }

  /**
   * Add a user message to the conversation
   */
  addUserMessage(content: string): UIMessage {
    const userMessage: UIMessage = {
      id: generateMessageId(),
      role: 'user',
      parts: [{ type: 'text', content }],
      createdAt: new Date(),
    }

    this.messages = [...this.messages, userMessage]
    this.emitMessagesChange()

    return userMessage
  }

  /**
   * Start streaming a new assistant message
   * Returns the message ID
   */
  startAssistantMessage(): string {
    // Reset stream state for new message
    this.resetStreamState()

    const assistantMessage: UIMessage = {
      id: generateMessageId(),
      role: 'assistant',
      parts: [],
      createdAt: new Date(),
    }

    this.currentAssistantMessageId = assistantMessage.id
    this.messages = [...this.messages, assistantMessage]

    // Emit events
    this.events.onStreamStart?.()
    this.emitMessagesChange()

    return assistantMessage.id
  }

  /**
   * Add a tool result (called by client after handling onToolCall)
   */
  addToolResult(toolCallId: string, output: any, error?: string): void {
    // Find the message containing this tool call
    const messageWithToolCall = this.messages.find((msg) =>
      msg.parts.some(
        (p): p is ToolCallPart => p.type === 'tool-call' && p.id === toolCallId,
      ),
    )

    if (!messageWithToolCall) {
      console.warn(
        `[StreamProcessor] Could not find message with tool call ${toolCallId}`,
      )
      return
    }

    // Step 1: Update the tool-call part's output field (for UI rendering)
    let updatedMessages = updateToolCallWithOutput(
      this.messages,
      toolCallId,
      output,
      error ? 'input-complete' : undefined,
      error,
    )

    // Step 2: Create a tool-result part (for LLM conversation history)
    const content = typeof output === 'string' ? output : JSON.stringify(output)
    const toolResultState: ToolResultState = error ? 'error' : 'complete'

    updatedMessages = updateToolResultPart(
      updatedMessages,
      messageWithToolCall.id,
      toolCallId,
      content,
      toolResultState,
      error,
    )

    this.messages = updatedMessages
    this.emitMessagesChange()
  }

  /**
   * Add an approval response (called by client after handling onApprovalRequest)
   */
  addToolApprovalResponse(approvalId: string, approved: boolean): void {
    this.messages = updateToolCallApprovalResponse(
      this.messages,
      approvalId,
      approved,
    )
    this.emitMessagesChange()
  }

  /**
   * Get the conversation as ModelMessages (for sending to LLM)
   */
  toModelMessages(): Array<ModelMessage> {
    const modelMessages: Array<ModelMessage> = []
    for (const msg of this.messages) {
      modelMessages.push(...uiMessageToModelMessages(msg))
    }
    return modelMessages
  }

  /**
   * Get current messages
   */
  getMessages(): Array<UIMessage> {
    return this.messages
  }

  /**
   * Check if all tool calls in the last assistant message are complete
   * Useful for auto-continue logic
   */
  areAllToolsComplete(): boolean {
    const lastAssistant = this.messages.findLast(
      (m: UIMessage) => m.role === 'assistant',
    )

    if (!lastAssistant) return true

    const toolParts = lastAssistant.parts.filter(
      (p): p is ToolCallPart => p.type === 'tool-call',
    )

    if (toolParts.length === 0) return true

    // All tool calls must be in a terminal state
    return toolParts.every(
      (part) =>
        part.state === 'approval-responded' ||
        (part.output !== undefined && !part.approval),
    )
  }

  /**
   * Remove messages after a certain index (for reload/retry)
   */
  removeMessagesAfter(index: number): void {
    this.messages = this.messages.slice(0, index + 1)
    this.emitMessagesChange()
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = []
    this.currentAssistantMessageId = null
    this.emitMessagesChange()
  }

  // ============================================
  // Stream Processing Methods
  // ============================================

  /**
   * Process a stream and emit events through handlers
   */
  async process(stream: AsyncIterable<any>): Promise<ProcessorResult> {
    // Reset stream state (but keep messages)
    this.resetStreamState()

    // Start recording if enabled
    if (this.recordingEnabled) {
      this.startRecording()
    }

    // Process each chunk
    for await (const chunk of stream) {
      this.processChunk(chunk)
    }

    // Stream ended - finalize everything
    this.finalizeStream()

    // Finalize recording
    if (this.recording) {
      this.recording.result = this.getResult()
    }

    return this.getResult()
  }

  /**
   * Process a single chunk from the stream
   */
  processChunk(chunk: StreamChunk): void {
    // Record chunk if enabled
    if (this.recording) {
      this.recording.chunks.push({
        chunk,
        timestamp: Date.now(),
        index: this.recording.chunks.length,
      })
    }

    switch (chunk.type) {
      case 'content':
        this.handleContentChunk(chunk)
        break

      case 'tool_call':
        this.handleToolCallChunk(chunk)
        break

      case 'tool_result':
        this.handleToolResultChunk(chunk)
        break

      case 'done':
        this.handleDoneChunk(chunk)
        break

      case 'error':
        this.handleErrorChunk(chunk)
        break

      case 'thinking':
        this.handleThinkingChunk(chunk)
        break

      case 'approval-requested':
        this.handleApprovalRequestedChunk(chunk)
        break

      case 'tool-input-available':
        this.handleToolInputAvailableChunk(chunk)
        break

      default:
        // Unknown chunk type - ignore
        break
    }
  }

  /**
   * Handle a content chunk
   */
  private handleContentChunk(
    chunk: Extract<StreamChunk, { type: 'content' }>,
  ): void {
    // Content arriving means all current tool calls are complete
    this.completeAllToolCalls()

    const previousSegment = this.currentSegmentText

    // Detect if this is a NEW text segment (after tool calls) vs continuation
    const isNewSegment =
      this.hasToolCallsSinceTextStart &&
      previousSegment.length > 0 &&
      this.isNewTextSegment(chunk, previousSegment)

    if (isNewSegment) {
      // Emit any accumulated text before starting new segment
      if (previousSegment !== this.lastEmittedText) {
        this.emitTextUpdate()
      }
      // Reset SEGMENT text accumulation for the new text segment after tool calls
      this.currentSegmentText = ''
      this.lastEmittedText = ''
      this.hasToolCallsSinceTextStart = false
    }

    const currentText = this.currentSegmentText
    let nextText = currentText

    // Prefer delta over content - delta is the incremental change
    if (chunk.delta !== '') {
      nextText = currentText + chunk.delta
    } else if (chunk.content !== '') {
      // Fallback: use content if delta is not provided
      if (chunk.content.startsWith(currentText)) {
        nextText = chunk.content
      } else if (currentText.startsWith(chunk.content)) {
        nextText = currentText
      } else {
        nextText = currentText + chunk.content
      }
    }

    // Calculate the delta for totalTextContent
    const textDelta = nextText.slice(currentText.length)
    this.currentSegmentText = nextText
    this.totalTextContent += textDelta

    // Use delta for chunk strategy if available
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const chunkPortion = chunk.delta ?? chunk.content ?? ''
    const shouldEmit = this.chunkStrategy.shouldEmit(
      chunkPortion,
      this.currentSegmentText,
    )
    if (shouldEmit && this.currentSegmentText !== this.lastEmittedText) {
      this.emitTextUpdate()
    }
  }

  /**
   * Handle a tool call chunk
   */
  private handleToolCallChunk(
    chunk: Extract<StreamChunk, { type: 'tool_call' }>,
  ): void {
    // Mark that we've seen tool calls since the last text segment
    this.hasToolCallsSinceTextStart = true

    const toolCallId = chunk.toolCall.id
    const existingToolCall = this.toolCalls.get(toolCallId)

    if (!existingToolCall) {
      // New tool call starting
      const initialState: ToolCallState = chunk.toolCall.function.arguments
        ? 'input-streaming'
        : 'awaiting-input'

      const newToolCall: InternalToolCallState = {
        id: chunk.toolCall.id,
        name: chunk.toolCall.function.name,
        arguments: chunk.toolCall.function.arguments || '',
        state: initialState,
        parsedArguments: undefined,
        index: chunk.index,
      }

      // Try to parse the arguments
      if (chunk.toolCall.function.arguments) {
        newToolCall.parsedArguments = this.jsonParser.parse(
          chunk.toolCall.function.arguments,
        )
      }

      this.toolCalls.set(toolCallId, newToolCall)
      this.toolCallOrder.push(toolCallId)

      // Get actual index for this tool call (based on order)
      const actualIndex = this.toolCallOrder.indexOf(toolCallId)

      // Emit legacy lifecycle event
      this.handlers.onToolCallStart?.(
        actualIndex,
        chunk.toolCall.id,
        chunk.toolCall.function.name,
      )

      // Emit legacy state change event
      this.handlers.onToolCallStateChange?.(
        actualIndex,
        chunk.toolCall.id,
        chunk.toolCall.function.name,
        initialState,
        chunk.toolCall.function.arguments || '',
        newToolCall.parsedArguments,
      )

      // Emit initial delta
      if (chunk.toolCall.function.arguments) {
        this.handlers.onToolCallDelta?.(
          actualIndex,
          chunk.toolCall.function.arguments,
        )
      }

      // Update UIMessage
      if (this.currentAssistantMessageId) {
        this.messages = updateToolCallPart(
          this.messages,
          this.currentAssistantMessageId,
          {
            id: chunk.toolCall.id,
            name: chunk.toolCall.function.name,
            arguments: chunk.toolCall.function.arguments || '',
            state: initialState,
          },
        )
        this.emitMessagesChange()

        // Emit new granular event
        this.events.onToolCallStateChange?.(
          this.currentAssistantMessageId,
          chunk.toolCall.id,
          initialState,
          chunk.toolCall.function.arguments || '',
        )
      }
    } else {
      // Continuing existing tool call
      const wasAwaitingInput = existingToolCall.state === 'awaiting-input'

      existingToolCall.arguments += chunk.toolCall.function.arguments || ''

      // Update state
      if (wasAwaitingInput && chunk.toolCall.function.arguments) {
        existingToolCall.state = 'input-streaming'
      }

      // Try to parse the updated arguments
      existingToolCall.parsedArguments = this.jsonParser.parse(
        existingToolCall.arguments,
      )

      // Get actual index for this tool call
      const actualIndex = this.toolCallOrder.indexOf(toolCallId)

      // Emit legacy state change event
      this.handlers.onToolCallStateChange?.(
        actualIndex,
        existingToolCall.id,
        existingToolCall.name,
        existingToolCall.state,
        existingToolCall.arguments,
        existingToolCall.parsedArguments,
      )

      // Emit delta
      if (chunk.toolCall.function.arguments) {
        this.handlers.onToolCallDelta?.(
          actualIndex,
          chunk.toolCall.function.arguments,
        )
      }

      // Update UIMessage
      if (this.currentAssistantMessageId) {
        this.messages = updateToolCallPart(
          this.messages,
          this.currentAssistantMessageId,
          {
            id: existingToolCall.id,
            name: existingToolCall.name,
            arguments: existingToolCall.arguments,
            state: existingToolCall.state,
          },
        )
        this.emitMessagesChange()

        // Emit new granular event
        this.events.onToolCallStateChange?.(
          this.currentAssistantMessageId,
          existingToolCall.id,
          existingToolCall.state,
          existingToolCall.arguments,
        )
      }
    }
  }

  /**
   * Handle a tool result chunk
   */
  private handleToolResultChunk(
    chunk: Extract<StreamChunk, { type: 'tool_result' }>,
  ): void {
    const state: ToolResultState = 'complete'

    // Emit legacy handler
    this.handlers.onToolResultStateChange?.(
      chunk.toolCallId,
      chunk.content,
      state,
    )

    // Update UIMessage if we have a current assistant message
    if (this.currentAssistantMessageId) {
      this.messages = updateToolResultPart(
        this.messages,
        this.currentAssistantMessageId,
        chunk.toolCallId,
        chunk.content,
        state,
      )
      this.emitMessagesChange()
    }
  }

  /**
   * Handle a done chunk
   */
  private handleDoneChunk(chunk: Extract<StreamChunk, { type: 'done' }>): void {
    this.finishReason = chunk.finishReason
    this.isDone = true
    this.completeAllToolCalls()
  }

  /**
   * Handle an error chunk
   */
  private handleErrorChunk(
    chunk: Extract<StreamChunk, { type: 'error' }>,
  ): void {
    // Emit legacy handler
    this.handlers.onError?.(chunk.error)

    // Emit new event
    this.events.onError?.(new Error(chunk.error.message))
  }

  /**
   * Handle a thinking chunk
   */
  private handleThinkingChunk(
    chunk: Extract<StreamChunk, { type: 'thinking' }>,
  ): void {
    const previous = this.thinkingContent
    let nextThinking = previous

    // Prefer delta over content
    if (chunk.delta !== '') {
      nextThinking = previous + chunk.delta
    } else if (chunk.content !== '') {
      if (chunk.content.startsWith(previous)) {
        nextThinking = chunk.content
      } else if (previous.startsWith(chunk.content)) {
        nextThinking = previous
      } else {
        nextThinking = previous + chunk.content
      }
    }

    this.thinkingContent = nextThinking

    // Emit legacy handler
    this.handlers.onThinkingUpdate?.(this.thinkingContent)

    // Update UIMessage
    if (this.currentAssistantMessageId) {
      this.messages = updateThinkingPart(
        this.messages,
        this.currentAssistantMessageId,
        this.thinkingContent,
      )
      this.emitMessagesChange()

      // Emit new granular event
      this.events.onThinkingUpdate?.(
        this.currentAssistantMessageId,
        this.thinkingContent,
      )
    }
  }

  /**
   * Handle an approval-requested chunk
   */
  private handleApprovalRequestedChunk(
    chunk: Extract<StreamChunk, { type: 'approval-requested' }>,
  ): void {
    // Emit legacy handler
    this.handlers.onApprovalRequested?.(
      chunk.toolCallId,
      chunk.toolName,
      chunk.input,
      chunk.approval.id,
    )

    // Update UIMessage with approval metadata
    if (this.currentAssistantMessageId) {
      this.messages = updateToolCallApproval(
        this.messages,
        this.currentAssistantMessageId,
        chunk.toolCallId,
        chunk.approval.id,
      )
      this.emitMessagesChange()
    }

    // Emit new event
    this.events.onApprovalRequest?.({
      toolCallId: chunk.toolCallId,
      toolName: chunk.toolName,
      input: chunk.input,
      approvalId: chunk.approval.id,
    })
  }

  /**
   * Handle a tool-input-available chunk
   */
  private handleToolInputAvailableChunk(
    chunk: Extract<StreamChunk, { type: 'tool-input-available' }>,
  ): void {
    // Emit legacy handler
    this.handlers.onToolInputAvailable?.(
      chunk.toolCallId,
      chunk.toolName,
      chunk.input,
    )

    // Emit new event
    this.events.onToolCall?.({
      toolCallId: chunk.toolCallId,
      toolName: chunk.toolName,
      input: chunk.input,
    })
  }

  /**
   * Detect if an incoming content chunk represents a NEW text segment
   */
  private isNewTextSegment(
    chunk: Extract<StreamChunk, { type: 'content' }>,
    previous: string,
  ): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (chunk.delta !== undefined && chunk.content !== undefined) {
      if (chunk.content.length < previous.length) {
        return true
      }
      if (
        !chunk.content.startsWith(previous) &&
        !previous.startsWith(chunk.content)
      ) {
        return true
      }
    }
    return false
  }

  /**
   * Complete all tool calls
   */
  private completeAllToolCalls(): void {
    this.toolCalls.forEach((toolCall, id) => {
      if (toolCall.state !== 'input-complete') {
        const index = this.toolCallOrder.indexOf(id)
        this.completeToolCall(index, toolCall)
      }
    })
  }

  /**
   * Mark a tool call as complete and emit event
   */
  private completeToolCall(
    index: number,
    toolCall: InternalToolCallState,
  ): void {
    toolCall.state = 'input-complete'

    // Try final parse
    toolCall.parsedArguments = this.jsonParser.parse(toolCall.arguments)

    // Emit legacy state change event
    this.handlers.onToolCallStateChange?.(
      index,
      toolCall.id,
      toolCall.name,
      'input-complete',
      toolCall.arguments,
      toolCall.parsedArguments,
    )

    // Emit legacy complete event
    this.handlers.onToolCallComplete?.(
      index,
      toolCall.id,
      toolCall.name,
      toolCall.arguments,
    )

    // Update UIMessage
    if (this.currentAssistantMessageId) {
      this.messages = updateToolCallPart(
        this.messages,
        this.currentAssistantMessageId,
        {
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
          state: 'input-complete',
        },
      )
      this.emitMessagesChange()

      // Emit new granular event
      this.events.onToolCallStateChange?.(
        this.currentAssistantMessageId,
        toolCall.id,
        'input-complete',
        toolCall.arguments,
      )
    }
  }

  /**
   * Emit pending text update
   */
  private emitTextUpdate(): void {
    this.lastEmittedText = this.currentSegmentText

    // Emit legacy handler
    this.handlers.onTextUpdate?.(this.currentSegmentText)

    // Update UIMessage
    if (this.currentAssistantMessageId) {
      this.messages = updateTextPart(
        this.messages,
        this.currentAssistantMessageId,
        this.currentSegmentText,
      )
      this.emitMessagesChange()

      // Emit new granular event
      this.events.onTextUpdate?.(
        this.currentAssistantMessageId,
        this.currentSegmentText,
      )
    }
  }

  /**
   * Emit messages change event
   */
  private emitMessagesChange(): void {
    this.events.onMessagesChange?.([...this.messages])
  }

  /**
   * Finalize the stream - complete all pending operations
   */
  finalizeStream(): void {
    // Complete any remaining tool calls
    this.completeAllToolCalls()

    // Emit any pending text if not already emitted
    if (this.currentSegmentText !== this.lastEmittedText) {
      this.emitTextUpdate()
    }

    // Emit legacy stream end with total accumulated content
    const toolCalls = this.getCompletedToolCalls()
    this.handlers.onStreamEnd?.(
      this.totalTextContent,
      toolCalls.length > 0 ? toolCalls : undefined,
    )

    // Emit new stream end event
    if (this.currentAssistantMessageId) {
      const assistantMessage = this.messages.find(
        (m) => m.id === this.currentAssistantMessageId,
      )
      if (assistantMessage) {
        this.events.onStreamEnd?.(assistantMessage)
      }
    }
  }

  /**
   * Get completed tool calls in API format
   */
  private getCompletedToolCalls(): Array<ToolCall> {
    return Array.from(this.toolCalls.values())
      .filter((tc) => tc.state === 'input-complete')
      .map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      }))
  }

  /**
   * Get current result
   */
  private getResult(): ProcessorResult {
    const toolCalls = this.getCompletedToolCalls()
    return {
      content: this.totalTextContent,
      thinking: this.thinkingContent || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: this.finishReason,
    }
  }

  /**
   * Get current processor state (legacy)
   */
  getState(): ProcessorState {
    return {
      content: this.totalTextContent,
      thinking: this.thinkingContent,
      toolCalls: new Map(this.toolCalls),
      toolCallOrder: [...this.toolCallOrder],
      finishReason: this.finishReason,
      done: this.isDone,
    }
  }

  /**
   * Start recording chunks
   */
  startRecording(): void {
    this.recordingEnabled = true
    this.recordingStartTime = Date.now()
    this.recording = {
      version: '1.0',
      timestamp: this.recordingStartTime,
      chunks: [],
    }
  }

  /**
   * Get the current recording
   */
  getRecording(): ChunkRecording | null {
    return this.recording
  }

  /**
   * Reset stream state (but keep messages)
   */
  private resetStreamState(): void {
    this.totalTextContent = ''
    this.currentSegmentText = ''
    this.lastEmittedText = ''
    this.thinkingContent = ''
    this.toolCalls.clear()
    this.toolCallOrder = []
    this.finishReason = null
    this.isDone = false
    this.hasToolCallsSinceTextStart = false
    this.chunkStrategy.reset?.()
  }

  /**
   * Full reset (including messages)
   */
  reset(): void {
    this.resetStreamState()
    this.messages = []
    this.currentAssistantMessageId = null
  }

  /**
   * Replay a recording through the processor
   */
  static async replay(
    recording: ChunkRecording,
    options?: StreamProcessorOptions,
  ): Promise<ProcessorResult> {
    const processor = new StreamProcessor(options)
    return processor.process(createReplayStream(recording))
  }
}

/**
 * Create an async iterable from a recording
 */
export function createReplayStream(
  recording: ChunkRecording,
): AsyncIterable<StreamChunk> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *[Symbol.asyncIterator]() {
      for (const { chunk } of recording.chunks) {
        yield chunk
      }
    },
  }
}
