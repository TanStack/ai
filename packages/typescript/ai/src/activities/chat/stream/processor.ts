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
import { generateMessageId, uiMessageToModelMessages } from '../messages.js'
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
} from '../../../types'

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
 * Options for StreamProcessor
 */
export interface StreamProcessorOptions {
  chunkStrategy?: ChunkStrategy
  /** Event-driven handlers */
  events?: StreamProcessorEvents
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
      // AG-UI Events
      case 'TEXT_MESSAGE_CONTENT':
        this.handleTextMessageContentEvent(chunk)
        break

      case 'TOOL_CALL_START':
        this.handleToolCallStartEvent(chunk)
        break

      case 'TOOL_CALL_ARGS':
        this.handleToolCallArgsEvent(chunk)
        break

      case 'TOOL_CALL_END':
        this.handleToolCallEndEvent(chunk)
        break

      case 'RUN_FINISHED':
        this.handleRunFinishedEvent(chunk)
        break

      case 'RUN_ERROR':
        this.handleRunErrorEvent(chunk)
        break

      case 'STEP_FINISHED':
        this.handleStepFinishedEvent(chunk)
        break

      case 'CUSTOM':
        this.handleCustomEvent(chunk)
        break

      default:
        // RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_END, STEP_STARTED,
        // STATE_SNAPSHOT, STATE_DELTA - no special handling needed
        break
    }
  }

  /**
   * Handle TEXT_MESSAGE_CONTENT event
   */
  private handleTextMessageContentEvent(
    chunk: Extract<StreamChunk, { type: 'TEXT_MESSAGE_CONTENT' }>,
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
    } else if (chunk.content && chunk.content !== '') {
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
    const chunkPortion = chunk.delta || chunk.content || ''
    const shouldEmit = this.chunkStrategy.shouldEmit(
      chunkPortion,
      this.currentSegmentText,
    )
    if (shouldEmit && this.currentSegmentText !== this.lastEmittedText) {
      this.emitTextUpdate()
    }
  }

  /**
   * Handle TOOL_CALL_START event
   */
  private handleToolCallStartEvent(
    chunk: Extract<StreamChunk, { type: 'TOOL_CALL_START' }>,
  ): void {
    // Mark that we've seen tool calls since the last text segment
    this.hasToolCallsSinceTextStart = true

    const toolCallId = chunk.toolCallId
    const existingToolCall = this.toolCalls.get(toolCallId)

    if (!existingToolCall) {
      // New tool call starting
      const initialState: ToolCallState = 'awaiting-input'

      const newToolCall: InternalToolCallState = {
        id: chunk.toolCallId,
        name: chunk.toolName,
        arguments: '',
        state: initialState,
        parsedArguments: undefined,
        index: chunk.index ?? this.toolCalls.size,
      }

      this.toolCalls.set(toolCallId, newToolCall)
      this.toolCallOrder.push(toolCallId)

      // Update UIMessage
      if (this.currentAssistantMessageId) {
        this.messages = updateToolCallPart(
          this.messages,
          this.currentAssistantMessageId,
          {
            id: chunk.toolCallId,
            name: chunk.toolName,
            arguments: '',
            state: initialState,
          },
        )
        this.emitMessagesChange()

        // Emit granular event
        this.events.onToolCallStateChange?.(
          this.currentAssistantMessageId,
          chunk.toolCallId,
          initialState,
          '',
        )
      }
    }
  }

  /**
   * Handle TOOL_CALL_ARGS event
   */
  private handleToolCallArgsEvent(
    chunk: Extract<StreamChunk, { type: 'TOOL_CALL_ARGS' }>,
  ): void {
    const toolCallId = chunk.toolCallId
    const existingToolCall = this.toolCalls.get(toolCallId)

    if (existingToolCall) {
      const wasAwaitingInput = existingToolCall.state === 'awaiting-input'

      // Accumulate arguments from delta
      existingToolCall.arguments += chunk.delta || ''

      // Update state
      if (wasAwaitingInput && chunk.delta) {
        existingToolCall.state = 'input-streaming'
      }

      // Try to parse the updated arguments
      existingToolCall.parsedArguments = this.jsonParser.parse(
        existingToolCall.arguments,
      )

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

        // Emit granular event
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
   * Handle TOOL_CALL_END event
   */
  private handleToolCallEndEvent(
    chunk: Extract<StreamChunk, { type: 'TOOL_CALL_END' }>,
  ): void {
    const state: ToolResultState = 'complete'

    // Update UIMessage if we have a current assistant message
    if (this.currentAssistantMessageId && chunk.result) {
      this.messages = updateToolResultPart(
        this.messages,
        this.currentAssistantMessageId,
        chunk.toolCallId,
        chunk.result,
        state,
      )
      this.emitMessagesChange()
    }
  }

  /**
   * Handle RUN_FINISHED event
   */
  private handleRunFinishedEvent(
    chunk: Extract<StreamChunk, { type: 'RUN_FINISHED' }>,
  ): void {
    this.finishReason = chunk.finishReason
    this.isDone = true
    this.completeAllToolCalls()
  }

  /**
   * Handle RUN_ERROR event
   */
  private handleRunErrorEvent(
    chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
  ): void {
    // Emit error event
    this.events.onError?.(new Error(chunk.error.message || 'An error occurred'))
  }

  /**
   * Handle STEP_FINISHED event (for thinking/reasoning content)
   */
  private handleStepFinishedEvent(
    chunk: Extract<StreamChunk, { type: 'STEP_FINISHED' }>,
  ): void {
    const previous = this.thinkingContent
    let nextThinking = previous

    // Prefer delta over content
    if (chunk.delta && chunk.delta !== '') {
      nextThinking = previous + chunk.delta
    } else if (chunk.content && chunk.content !== '') {
      if (chunk.content.startsWith(previous)) {
        nextThinking = chunk.content
      } else if (previous.startsWith(chunk.content)) {
        nextThinking = previous
      } else {
        nextThinking = previous + chunk.content
      }
    }

    this.thinkingContent = nextThinking

    // Update UIMessage
    if (this.currentAssistantMessageId) {
      this.messages = updateThinkingPart(
        this.messages,
        this.currentAssistantMessageId,
        this.thinkingContent,
      )
      this.emitMessagesChange()

      // Emit granular event
      this.events.onThinkingUpdate?.(
        this.currentAssistantMessageId,
        this.thinkingContent,
      )
    }
  }

  /**
   * Handle CUSTOM event
   * Handles special custom events like 'tool-input-available' for client-side tool execution
   * and 'approval-requested' for tool approval flows
   */
  private handleCustomEvent(
    chunk: Extract<StreamChunk, { type: 'CUSTOM' }>,
  ): void {
    // Handle client tool input availability - trigger client-side execution
    if (chunk.name === 'tool-input-available' && chunk.data) {
      const { toolCallId, toolName, input } = chunk.data as {
        toolCallId: string
        toolName: string
        input: any
      }

      // Emit onToolCall event for the client to execute the tool
      this.events.onToolCall?.({
        toolCallId,
        toolName,
        input,
      })
    }

    // Handle approval requests
    if (chunk.name === 'approval-requested' && chunk.data) {
      const { toolCallId, toolName, input, approval } = chunk.data as {
        toolCallId: string
        toolName: string
        input: any
        approval: { id: string; needsApproval: boolean }
      }

      // Update the tool call part with approval state
      if (this.currentAssistantMessageId) {
        this.messages = updateToolCallApproval(
          this.messages,
          this.currentAssistantMessageId,
          toolCallId,
          approval.id,
        )
        this.emitMessagesChange()
      }

      // Emit approval request event
      this.events.onApprovalRequest?.({
        toolCallId,
        toolName,
        input,
        approvalId: approval.id,
      })
    }
  }

  /**
   * Detect if an incoming content chunk represents a NEW text segment
   */
  private isNewTextSegment(
    chunk: Extract<StreamChunk, { type: 'TEXT_MESSAGE_CONTENT' }>,
    previous: string,
  ): boolean {
    // Check if content is present (delta is always defined but may be empty string)
    if (chunk.content !== undefined) {
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
    _index: number,
    toolCall: InternalToolCallState,
  ): void {
    toolCall.state = 'input-complete'

    // Try final parse
    toolCall.parsedArguments = this.jsonParser.parse(toolCall.arguments)

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

      // Emit granular event
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

    // Update UIMessage
    if (this.currentAssistantMessageId) {
      this.messages = updateTextPart(
        this.messages,
        this.currentAssistantMessageId,
        this.currentSegmentText,
      )
      this.emitMessagesChange()

      // Emit granular event
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

    // Emit stream end event
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
   * Get current processor state
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
