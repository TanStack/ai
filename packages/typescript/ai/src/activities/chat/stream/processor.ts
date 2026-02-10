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
 *
 * @see docs/chat-architecture.md — Canonical reference for AG-UI chunk ordering,
 *   adapter contract, single-shot flows, and expected UIMessage output.
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
  ContentPart,
  MessagePart,
  ModelMessage,
  StreamChunk,
  ToolCall,
  ToolCallPart,
  ToolResultPart,
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
 * Trusts the adapter contract: adapters emit clean AG-UI events in the
 * correct order.
 *
 * State tracking:
 * - Full message array
 * - Current assistant message being streamed
 * - Text content accumulation (reset on TEXT_MESSAGE_START)
 * - Multiple parallel tool calls
 * - Tool call completion via TOOL_CALL_END events
 *
 * @see docs/chat-architecture.md#streamprocessor-internal-state — State field reference
 * @see docs/chat-architecture.md#adapter-contract — What this class expects from adapters
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
  private hasError = false
  private isDone = false

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
   * Add a user message to the conversation.
   * Supports both simple string content and multimodal content arrays.
   *
   * @param content - The message content (string or array of content parts)
   * @param id - Optional custom message ID (generated if not provided)
   * @returns The created UIMessage
   *
   * @example
   * ```ts
   * // Simple text message
   * processor.addUserMessage('Hello!')
   *
   * // Multimodal message with image
   * processor.addUserMessage([
   *   { type: 'text', content: 'What is in this image?' },
   *   { type: 'image', source: { type: 'url', value: 'https://example.com/photo.jpg' } }
   * ])
   *
   * // With custom ID
   * processor.addUserMessage('Hello!', 'custom-id-123')
   * ```
   */
  addUserMessage(content: string | Array<ContentPart>, id?: string): UIMessage {
    // Convert content to message parts
    const parts: Array<MessagePart> =
      typeof content === 'string'
        ? [{ type: 'text', content }]
        : content.map((part) => {
            // ContentPart types (text, image, audio, video, document) are compatible with MessagePart
            return part as MessagePart
          })

    const userMessage: UIMessage = {
      id: id ?? generateMessageId(),
      role: 'user',
      parts,
      createdAt: new Date(),
    }

    this.messages = [...this.messages, userMessage]
    this.emitMessagesChange()

    return userMessage
  }

  /**
   * Prepare for a new assistant message stream.
   * Does NOT create the message immediately -- the message is created lazily
   * when the first content-bearing chunk arrives via ensureAssistantMessage().
   * This prevents empty assistant messages from flickering in the UI when
   * auto-continuation produces no content.
   */
  prepareAssistantMessage(): void {
    // Reset stream state for new message
    this.resetStreamState()
    // Clear the current assistant message ID so ensureAssistantMessage()
    // will create a fresh message on the first content chunk
    this.currentAssistantMessageId = null
  }

  /**
   * @deprecated Use prepareAssistantMessage() instead. This eagerly creates
   * an assistant message which can cause empty message flicker.
   */
  startAssistantMessage(): string {
    this.prepareAssistantMessage()
    return this.ensureAssistantMessage()
  }

  /**
   * Get the current assistant message ID (if one has been created).
   * Returns null if prepareAssistantMessage() was called but no content
   * has arrived yet.
   */
  getCurrentAssistantMessageId(): string | null {
    return this.currentAssistantMessageId
  }

  /**
   * Lazily create the assistant message if it hasn't been created yet.
   * Called by content handlers on the first content-bearing chunk.
   * Returns the message ID.
   *
   * Content-bearing chunks that trigger this:
   * TEXT_MESSAGE_CONTENT, TOOL_CALL_START, STEP_FINISHED, RUN_ERROR.
   *
   * @see docs/chat-architecture.md#streamprocessor-internal-state — Lazy creation pattern
   */
  private ensureAssistantMessage(): string {
    if (this.currentAssistantMessageId) {
      return this.currentAssistantMessageId
    }

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

    // Get tool result parts to check for server tool completion
    const toolResultIds = new Set(
      lastAssistant.parts
        .filter((p): p is ToolResultPart => p.type === 'tool-result')
        .map((p) => p.toolCallId),
    )

    // All tool calls must be in a terminal state
    // A tool call is complete if:
    // 1. It was approved/denied (approval-responded state)
    // 2. It has an output field set (client tool completed via addToolResult)
    // 3. It has a corresponding tool-result part (server tool completed)
    return toolParts.every(
      (part) =>
        part.state === 'approval-responded' ||
        (part.output !== undefined && !part.approval) ||
        toolResultIds.has(part.id),
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
   * Process a single chunk from the stream.
   *
   * Central dispatch for all AG-UI events. Each event type maps to a specific
   * handler. Events not listed in the switch are intentionally ignored
   * (RUN_STARTED, TEXT_MESSAGE_END, STEP_STARTED, STATE_SNAPSHOT, STATE_DELTA).
   *
   * @see docs/chat-architecture.md#adapter-contract — Expected event types and ordering
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
      case 'TEXT_MESSAGE_START':
        this.handleTextMessageStartEvent()
        break

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
        // RUN_STARTED, TEXT_MESSAGE_END, STEP_STARTED,
        // STATE_SNAPSHOT, STATE_DELTA - no special handling needed
        break
    }
  }

  /**
   * Handle TEXT_MESSAGE_START event — marks the beginning of a new text segment.
   * Resets segment accumulation so text after tool calls starts fresh.
   *
   * This is the key mechanism for multi-segment text (text before and after tool
   * calls becoming separate TextParts). Without this reset, all text would merge
   * into a single TextPart and tool-call interleaving would be lost.
   *
   * @see docs/chat-architecture.md#single-shot-text-response — Step-by-step text processing
   * @see docs/chat-architecture.md#text-then-tool-interleaving-single-shot — Multi-segment text
   */
  private handleTextMessageStartEvent(): void {
    // Emit any pending text from a previous segment before resetting
    if (this.currentSegmentText !== this.lastEmittedText) {
      this.emitTextUpdate()
    }
    this.currentSegmentText = ''
    this.lastEmittedText = ''
  }

  /**
   * Handle TEXT_MESSAGE_CONTENT event.
   *
   * Accumulates delta into both currentSegmentText (for UI emission) and
   * totalTextContent (for ProcessorResult). Lazily creates the assistant
   * UIMessage on first content. Uses updateTextPart() which replaces the
   * last TextPart or creates a new one depending on part ordering.
   *
   * @see docs/chat-architecture.md#single-shot-text-response — Text accumulation step-by-step
   * @see docs/chat-architecture.md#uimessage-part-ordering-invariants — Replace vs. push logic
   */
  private handleTextMessageContentEvent(
    chunk: Extract<StreamChunk, { type: 'TEXT_MESSAGE_CONTENT' }>,
  ): void {
    this.ensureAssistantMessage()

    this.currentSegmentText += chunk.delta
    this.totalTextContent += chunk.delta

    const shouldEmit = this.chunkStrategy.shouldEmit(
      chunk.delta,
      this.currentSegmentText,
    )
    if (shouldEmit && this.currentSegmentText !== this.lastEmittedText) {
      this.emitTextUpdate()
    }
  }

  /**
   * Handle TOOL_CALL_START event.
   *
   * Creates a new InternalToolCallState entry in the toolCalls Map and appends
   * a ToolCallPart to the UIMessage. Duplicate toolCallId is a no-op.
   *
   * CRITICAL: This MUST be received before any TOOL_CALL_ARGS for the same
   * toolCallId. Args for unknown IDs are silently dropped.
   *
   * @see docs/chat-architecture.md#single-shot-tool-call-response — Tool call state transitions
   * @see docs/chat-architecture.md#parallel-tool-calls-single-shot — Parallel tracking by ID
   * @see docs/chat-architecture.md#adapter-contract — Ordering requirements
   */
  private handleToolCallStartEvent(
    chunk: Extract<StreamChunk, { type: 'TOOL_CALL_START' }>,
  ): void {
    this.ensureAssistantMessage()

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
   * Handle TOOL_CALL_ARGS event.
   *
   * Appends the delta to the tool call's accumulated arguments string.
   * Transitions state from awaiting-input → input-streaming on first non-empty delta.
   * Attempts partial JSON parse on each update for UI preview.
   *
   * If toolCallId is not found in the Map (no preceding TOOL_CALL_START),
   * this event is silently dropped.
   *
   * @see docs/chat-architecture.md#single-shot-tool-call-response — Step-by-step tool call processing
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
   * Handle TOOL_CALL_END event — authoritative signal that a tool call's input is finalized.
   *
   * This event has a DUAL ROLE:
   * - Without `result`: Signals arguments are done (from adapter). Transitions to input-complete.
   * - With `result`: Signals tool was executed and result is available (from TextEngine).
   *   Creates both output on the tool-call part AND a tool-result part.
   *
   * If `input` is provided, it overrides the accumulated string parse as the
   * canonical parsed arguments.
   *
   * @see docs/chat-architecture.md#tool-results-and-the-tool_call_end-dual-role — Full explanation
   * @see docs/chat-architecture.md#single-shot-tool-call-response — End-to-end flow
   */
  private handleToolCallEndEvent(
    chunk: Extract<StreamChunk, { type: 'TOOL_CALL_END' }>,
  ): void {
    // Transition the tool call to input-complete (the authoritative completion signal)
    const existingToolCall = this.toolCalls.get(chunk.toolCallId)
    if (existingToolCall && existingToolCall.state !== 'input-complete') {
      const index = this.toolCallOrder.indexOf(chunk.toolCallId)
      this.completeToolCall(index, existingToolCall)
      // If TOOL_CALL_END provides parsed input, use it as the canonical parsed
      // arguments (overrides the accumulated string parse from completeToolCall)
      if (chunk.input !== undefined) {
        existingToolCall.parsedArguments = chunk.input
      }
    }

    // Update UIMessage if we have a current assistant message and a result
    if (this.currentAssistantMessageId && chunk.result) {
      const state: ToolResultState = 'complete'

      // Step 1: Update the tool-call part's output field (for UI consistency
      // with client tools — see GitHub issue #176)
      let output: unknown
      try {
        output = JSON.parse(chunk.result)
      } catch {
        output = chunk.result
      }
      this.messages = updateToolCallWithOutput(
        this.messages,
        chunk.toolCallId,
        output,
      )

      // Step 2: Create/update the tool-result part (for LLM conversation history)
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
   * Handle RUN_FINISHED event.
   *
   * Records the finishReason and calls completeAllToolCalls() as a safety net
   * to force-complete any tool calls that didn't receive an explicit TOOL_CALL_END.
   * This handles cases like aborted streams or adapter bugs.
   *
   * @see docs/chat-architecture.md#single-shot-tool-call-response — finishReason semantics
   * @see docs/chat-architecture.md#adapter-contract — Why RUN_FINISHED is mandatory
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
    this.hasError = true
    this.ensureAssistantMessage()
    // Emit error event
    this.events.onError?.(new Error(chunk.error.message || 'An error occurred'))
  }

  /**
   * Handle STEP_FINISHED event (for thinking/reasoning content).
   *
   * Accumulates delta into thinkingContent and updates a single ThinkingPart
   * in the UIMessage (replaced in-place, not appended).
   *
   * @see docs/chat-architecture.md#thinkingreasoning-content — Thinking flow
   */
  private handleStepFinishedEvent(
    chunk: Extract<StreamChunk, { type: 'STEP_FINISHED' }>,
  ): void {
    this.ensureAssistantMessage()

    this.thinkingContent += chunk.delta

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
   * Handle CUSTOM event.
   *
   * Handles special custom events emitted by the TextEngine (not adapters):
   * - 'tool-input-available': Client tool needs execution. Fires onToolCall.
   * - 'approval-requested': Tool needs user approval. Updates tool-call part
   *   state and fires onApprovalRequest.
   *
   * @see docs/chat-architecture.md#client-tools-and-approval-flows — Full flow details
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
   * Complete all tool calls — safety net for stream termination.
   *
   * Called by RUN_FINISHED and finalizeStream(). Force-transitions any tool call
   * not yet in input-complete state. Handles cases where TOOL_CALL_END was
   * missed (adapter bug, network error, aborted stream).
   *
   * @see docs/chat-architecture.md#single-shot-tool-call-response — Safety net behavior
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
   * Emit pending text update.
   *
   * Calls updateTextPart() which has critical append-vs-replace logic:
   * - If last UIMessage part is TextPart → replaces its content (same segment).
   * - If last part is anything else → pushes new TextPart (new segment after tools).
   *
   * @see docs/chat-architecture.md#uimessage-part-ordering-invariants — Replace vs. push logic
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
   * Finalize the stream — complete all pending operations.
   *
   * Called when the async iterable ends (stream closed). Acts as the final
   * safety net: completes any remaining tool calls, flushes un-emitted text,
   * and fires onStreamEnd.
   *
   * @see docs/chat-architecture.md#single-shot-text-response — Finalization step
   */
  finalizeStream(): void {
    // Safety net: complete any remaining tool calls (e.g. on network errors / aborted streams)
    this.completeAllToolCalls()

    // Emit any pending text if not already emitted
    if (this.currentSegmentText !== this.lastEmittedText) {
      this.emitTextUpdate()
    }

    // Remove the assistant message if it only contains whitespace text
    // (no tool calls, no meaningful content). This handles models like Gemini
    // that sometimes return just "\n" during auto-continuation.
    // Preserve the message on errors so the UI can show error state.
    if (this.currentAssistantMessageId && !this.hasError) {
      const assistantMessage = this.messages.find(
        (m) => m.id === this.currentAssistantMessageId,
      )
      if (assistantMessage && this.isWhitespaceOnlyMessage(assistantMessage)) {
        this.messages = this.messages.filter(
          (m) => m.id !== this.currentAssistantMessageId,
        )
        this.emitMessagesChange()
        this.currentAssistantMessageId = null
        return
      }
    }

    // Emit stream end event (only if a message was actually created)
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
    this.hasError = false
    this.isDone = false
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
   * Check if a message contains only whitespace text and no other meaningful parts
   * (no tool calls, tool results, thinking, etc.)
   */
  private isWhitespaceOnlyMessage(message: UIMessage): boolean {
    if (message.parts.length === 0) return false
    return message.parts.every(
      (part) => part.type === 'text' && part.content.trim() === '',
    )
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
