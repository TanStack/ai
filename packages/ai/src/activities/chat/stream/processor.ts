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
 * - Per-message stream state tracking for multi-message sessions
 *
 * @see docs/chat-architecture.md — Canonical reference for AG-UI chunk ordering,
 *   adapter contract, single-shot flows, and expected UIMessage output.
 */
import {
  aguiSnapshotMessageToUIMessage,
  generateMessageId,
  uiMessageToModelMessages,
} from '../messages.js'
import { normalizeToolResult } from '../../../utilities/tool-result'
import { isProviderExecutedToolCall } from '../../../utilities/provider-executed'
import { defaultJSONParser } from './json-parser'
import {
  appendStructuredOutputDelta,
  completeStructuredOutputPart,
  errorStructuredOutputPart,
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
  MessageStreamState,
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
  UIResourceEvent,
  UIResourcePart,
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

  // Custom events from server-side tools
  onCustomEvent?: (
    eventType: string,
    data: unknown,
    context: { toolCallId?: string },
  ) => void

  // Granular events for UI optimization (character-by-character, state tracking)
  onTextUpdate?: (messageId: string, content: string) => void
  onToolCallStateChange?: (
    messageId: string,
    toolCallId: string,
    state: ToolCallState,
    args: string,
  ) => void
  onThinkingUpdate?: (
    messageId: string,
    stepId: string,
    content: string,
  ) => void
  onStructuredOutputChange?: (args: {
    phase: 'start' | 'update' | 'complete' | 'error'
    messageId: string
    status: 'streaming' | 'complete' | 'error'
    raw: string
    partial?: unknown
    data?: unknown
    reasoning?: string
    errorMessage?: string
    delta?: string
  }) => void
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

const STRUCTURED_OUTPUT_UPDATE_BATCH_SIZE = 12

/**
 * StreamProcessor - State machine for processing AI response streams
 *
 * Manages the full UIMessage[] conversation and emits events on changes.
 * Trusts the adapter contract: adapters emit clean AG-UI events in the
 * correct order.
 *
 * State tracking:
 * - Full message array
 * - Per-message stream state (text, tool calls, thinking)
 * - Multiple concurrent message streams
 * - Tool call completion via TOOL_CALL_END events
 *
 * @see docs/chat-architecture.md#streamprocessor-internal-state — State field reference
 * @see docs/chat-architecture.md#adapter-contract — What this class expects from adapters
 */
export class StreamProcessor {
  private readonly chunkStrategy: ChunkStrategy
  private readonly events: StreamProcessorEvents
  private readonly jsonParser: { parse: (jsonString: string) => any }
  private recordingEnabled: boolean

  // Message state
  private messages: Array<UIMessage> = []

  // Per-message stream state
  private readonly messageStates: Map<string, MessageStreamState> = new Map()
  private readonly activeMessageIds: Set<string> = new Set()
  private readonly toolCallToMessage: Map<string, string> = new Map()
  private pendingManualMessageId: string | null = null
  private pendingThinkingStepId: string | null = null

  private readonly structuredMessageIds: Set<string> = new Set()
  private readonly structuredOutputUpdateBatches = new Map<
    string,
    {
      delta: string
      chunkCount: number
    }
  >()

  // Run tracking (for concurrent run safety)
  private readonly activeRuns = new Set<string>()

  // Shared stream state
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
            return part
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
  }

  /**
   * @deprecated Use prepareAssistantMessage() instead. This eagerly creates
   * an assistant message which can cause empty message flicker.
   */
  startAssistantMessage(messageId?: string): string {
    this.prepareAssistantMessage()
    const { messageId: id } = this.ensureAssistantMessage(messageId)
    this.pendingManualMessageId = id
    return id
  }

  /**
   * Get the current assistant message ID (if one has been created).
   * Returns null if prepareAssistantMessage() was called but no content
   * has arrived yet.
   */
  getCurrentAssistantMessageId(): string | null {
    // Scan all message states (not just active) for the last assistant.
    // After finalizeStream() clears activeMessageIds, messageStates retains entries.
    // After reset() / resetStreamState(), messageStates is cleared → returns null.
    let lastId: string | null = null
    for (const [id, state] of this.messageStates) {
      if (state.role === 'assistant') {
        lastId = id
      }
    }
    return lastId
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
      error ? 'error' : undefined,
      error,
    )

    // Step 2: Create a tool-result part (for LLM conversation history)
    const content = normalizeToolResult(output)
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
    // 4. It is provider-executed (e.g. Anthropic web_search) — already run by
    //    the provider, so there is no client result to wait for.
    return toolParts.every(
      (part) =>
        part.state === 'complete' ||
        part.state === 'approval-responded' ||
        (part.output !== undefined && !part.approval) ||
        toolResultIds.has(part.id) ||
        isProviderExecutedToolCall(part),
    )
  }

  /**
   * Remove messages after a certain index (for reload/retry)
   */
  removeMessagesAfter(index: number): void {
    const keptIds = new Set(this.messages.slice(0, index + 1).map((m) => m.id))
    // Drop routing state for messages that no longer exist; otherwise a
    // resumed stream (`reload()` or a server that reuses messageIds across
    // runs) could land deltas / tool args on stale map entries and corrupt
    // the new assistant message's parts. Mirror the four routing maps that
    // key on messageId: structuredMessageIds (custom-event routing),
    // messageStates (per-message stream state), toolCallToMessage (tool
    // args → message), and activeMessageIds (finalize / completeAllToolCalls
    // iteration targets — must not include phantoms).
    for (const id of this.structuredMessageIds) {
      if (!keptIds.has(id)) this.structuredMessageIds.delete(id)
    }
    for (const id of this.structuredOutputUpdateBatches.keys()) {
      if (!keptIds.has(id)) this.structuredOutputUpdateBatches.delete(id)
    }
    for (const id of this.messageStates.keys()) {
      if (!keptIds.has(id)) this.messageStates.delete(id)
    }
    for (const [toolCallId, msgId] of this.toolCallToMessage) {
      if (!keptIds.has(msgId)) this.toolCallToMessage.delete(toolCallId)
    }
    for (const id of this.activeMessageIds) {
      if (!keptIds.has(id)) this.activeMessageIds.delete(id)
    }
    this.messages = this.messages.slice(0, index + 1)
    this.emitMessagesChange()
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = []
    this.messageStates.clear()
    this.activeMessageIds.clear()
    this.toolCallToMessage.clear()
    this.structuredMessageIds.clear()
    this.structuredOutputUpdateBatches.clear()
    this.pendingManualMessageId = null
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
   * (STEP_STARTED, STATE_SNAPSHOT, STATE_DELTA).
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

    // Cast needed: @ag-ui/core Zod passthrough types add `& { [k: string]: unknown }`
    // which prevents TypeScript from narrowing the `type` discriminant in switch.
    const c = chunk
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- AG-UI EventType enum members vs string-literal case labels; default branch handles untraced events.
    switch (c.type) {
      // AG-UI Events
      case 'TEXT_MESSAGE_START':
        this.handleTextMessageStartEvent(
          chunk as Extract<StreamChunk, { type: 'TEXT_MESSAGE_START' }>,
        )
        break

      case 'TEXT_MESSAGE_CONTENT':
        this.handleTextMessageContentEvent(
          chunk as Extract<StreamChunk, { type: 'TEXT_MESSAGE_CONTENT' }>,
        )
        break

      case 'TEXT_MESSAGE_END':
        this.handleTextMessageEndEvent(
          chunk as Extract<StreamChunk, { type: 'TEXT_MESSAGE_END' }>,
        )
        break

      case 'TOOL_CALL_START':
        this.handleToolCallStartEvent(
          chunk as Extract<StreamChunk, { type: 'TOOL_CALL_START' }>,
        )
        break

      case 'TOOL_CALL_ARGS':
        this.handleToolCallArgsEvent(
          chunk as Extract<StreamChunk, { type: 'TOOL_CALL_ARGS' }>,
        )
        break

      case 'TOOL_CALL_END':
        this.handleToolCallEndEvent(
          chunk as Extract<StreamChunk, { type: 'TOOL_CALL_END' }>,
        )
        break

      case 'RUN_FINISHED':
        this.handleRunFinishedEvent(
          chunk as Extract<StreamChunk, { type: 'RUN_FINISHED' }>,
        )
        break

      case 'RUN_ERROR':
        this.handleRunErrorEvent(
          chunk as Extract<StreamChunk, { type: 'RUN_ERROR' }>,
        )
        break

      case 'STEP_FINISHED':
        this.handleStepFinishedEvent(
          chunk as Extract<StreamChunk, { type: 'STEP_FINISHED' }>,
        )
        break

      case 'MESSAGES_SNAPSHOT':
        this.handleMessagesSnapshotEvent(
          chunk as Extract<StreamChunk, { type: 'MESSAGES_SNAPSHOT' }>,
        )
        break

      case 'CUSTOM':
        this.handleCustomEvent(
          chunk as Extract<StreamChunk, { type: 'CUSTOM' }>,
        )
        break

      case 'RUN_STARTED':
        this.handleRunStartedEvent(
          chunk as Extract<StreamChunk, { type: 'RUN_STARTED' }>,
        )
        break

      case 'REASONING_START':
      case 'REASONING_MESSAGE_START':
      case 'REASONING_MESSAGE_END':
      case 'REASONING_END':
        // No special handling needed
        break

      case 'REASONING_MESSAGE_CONTENT':
        this.handleReasoningMessageContentEvent(
          chunk as Extract<StreamChunk, { type: 'REASONING_MESSAGE_CONTENT' }>,
        )
        break

      case 'TOOL_CALL_RESULT':
        this.handleToolCallResultEvent(
          chunk as Extract<StreamChunk, { type: 'TOOL_CALL_RESULT' }>,
        )
        break

      case 'STEP_STARTED':
        this.handleStepStartedEvent(
          chunk as Extract<StreamChunk, { type: 'STEP_STARTED' }>,
        )
        break

      default:
        // STATE_SNAPSHOT, STATE_DELTA - no special handling needed
        break
    }
  }

  // ============================================
  // Per-Message State Helpers
  // ============================================

  /**
   * Create a new MessageStreamState for a message
   */
  private createMessageState(
    messageId: string,
    role: 'user' | 'assistant' | 'system',
  ): MessageStreamState {
    const state: MessageStreamState = {
      id: messageId,
      role,
      totalTextContent: '',
      currentSegmentText: '',
      lastEmittedText: '',
      hasSeenReasoningEvents: false,
      thinkingSteps: new Map(),
      thinkingStepSignatures: new Map(),
      thinkingStepOrder: [],
      currentThinkingStepId: null,
      toolCalls: new Map(),
      toolCallOrder: [],
      hasToolCallsSinceTextStart: false,
      isComplete: false,
    }
    this.messageStates.set(messageId, state)
    return state
  }

  /**
   * Get the MessageStreamState for a message
   */
  private getMessageState(messageId: string): MessageStreamState | undefined {
    return this.messageStates.get(messageId)
  }

  /**
   * Promote a pending stepId from a STEP_STARTED that fired before the
   * assistant message existed onto the given message state, so the next
   * thinking event (STEP_FINISHED or REASONING_MESSAGE_CONTENT) attributes
   * to the correct step.
   */
  private consumePendingThinkingStep(state: MessageStreamState): void {
    if (!this.pendingThinkingStepId) return
    const stepId = this.pendingThinkingStepId
    state.currentThinkingStepId = stepId
    if (!state.thinkingSteps.has(stepId)) {
      state.thinkingSteps.set(stepId, '')
      state.thinkingStepOrder.push(stepId)
    }
    this.pendingThinkingStepId = null
  }

  /**
   * Get the most recent active assistant message ID.
   * Used as fallback for events that don't include a messageId.
   */
  private getActiveAssistantMessageId(): string | null {
    // Set iteration is insertion-order; reverse-iterate to search from the end
    const ids = Array.from(this.activeMessageIds).reverse()
    for (const id of ids) {
      const state = this.messageStates.get(id)
      if (state && state.role === 'assistant') {
        return id
      }
    }
    return null
  }

  /**
   * Ensure an active assistant message exists, creating one if needed.
   * Used for backward compat when events arrive without prior TEXT_MESSAGE_START.
   *
   * On reconnect/resume, a TEXT_MESSAGE_CONTENT may arrive for a message that
   * already exists in this.messages (e.g. from initialMessages or a prior
   * MESSAGES_SNAPSHOT) but whose transient state was cleared. In that case we
   * hydrate state from the existing message rather than creating a duplicate.
   */
  private ensureAssistantMessage(preferredId?: string): {
    messageId: string
    state: MessageStreamState
  } {
    // Try to find state by preferred ID
    if (preferredId) {
      const state = this.getMessageState(preferredId)
      if (state) return { messageId: preferredId, state }
    }

    // Try active assistant message
    const activeId = this.getActiveAssistantMessageId()
    if (activeId) {
      const state = this.getMessageState(activeId)
      if (state) return { messageId: activeId, state }
    }

    // Check if a message with preferredId already exists (reconnect/resume case).
    // Hydrate transient state from the existing message instead of duplicating it.
    if (preferredId) {
      const existingMsg = this.messages.find((m) => m.id === preferredId)
      if (existingMsg) {
        const state = this.createMessageState(preferredId, existingMsg.role)
        this.activeMessageIds.add(preferredId)

        // Seed segment text from the existing last text part so that
        // incoming deltas append correctly and updateTextPart produces
        // the right content (existing text + new delta).
        const lastPart =
          existingMsg.parts.length > 0
            ? existingMsg.parts[existingMsg.parts.length - 1]
            : null
        if (lastPart && lastPart.type === 'text') {
          state.currentSegmentText = lastPart.content
          state.lastEmittedText = lastPart.content
          state.totalTextContent = lastPart.content
        }

        return { messageId: preferredId, state }
      }
    }

    // Auto-create an assistant message (backward compat for process() without TEXT_MESSAGE_START)
    const id = preferredId || generateMessageId()
    const assistantMessage: UIMessage = {
      id,
      role: 'assistant',
      parts: [],
      createdAt: new Date(),
    }
    this.messages = [...this.messages, assistantMessage]
    const state = this.createMessageState(id, 'assistant')
    this.activeMessageIds.add(id)
    this.pendingManualMessageId = id
    this.events.onStreamStart?.()
    this.emitMessagesChange()
    return { messageId: id, state }
  }

  /**
   * Rename a message id across every structure keyed by it.
   *
   * A placeholder id (from ensureAssistantMessage / startAssistantMessage) is
   * renamed to the real provider id on TEXT_MESSAGE_START. Every structure that
   * holds that id must move together — miss one and the data it holds is
   * silently orphaned onto the vanished id (e.g. a tool result whose
   * toolCallToMessage entry still points at the placeholder). This is the same
   * id-keyed set enumerated by pruneToMessages() and reset().
   */
  private renameMessageId(oldId: string, newId: string): void {
    if (oldId === newId) return

    this.messages = this.messages.map((msg) =>
      msg.id === oldId ? { ...msg, id: newId } : msg,
    )

    const state = this.messageStates.get(oldId)
    if (state) {
      state.id = newId
      this.messageStates.delete(oldId)
      this.messageStates.set(newId, state)
    }

    this.activeMessageIds.delete(oldId)
    this.activeMessageIds.add(newId)

    // toolCallToMessage is keyed by toolCallId with the message id as the value.
    for (const [toolCallId, msgId] of this.toolCallToMessage) {
      if (msgId === oldId) this.toolCallToMessage.set(toolCallId, newId)
    }

    if (this.structuredMessageIds.delete(oldId)) {
      this.structuredMessageIds.add(newId)
    }

    const batch = this.structuredOutputUpdateBatches.get(oldId)
    if (batch !== undefined) {
      this.structuredOutputUpdateBatches.delete(oldId)
      this.structuredOutputUpdateBatches.set(newId, batch)
    }
  }

  // ============================================
  // Event Handlers
  // ============================================

  /**
   * Handle TEXT_MESSAGE_START event
   */
  private handleTextMessageStartEvent(
    chunk: Extract<StreamChunk, { type: 'TEXT_MESSAGE_START' }>,
  ): void {
    const { messageId, role } = chunk

    // Map 'tool' and 'developer' roles to 'assistant' for both UIMessage and MessageStreamState
    // (UIMessage doesn't support 'tool'/'developer' role, and lookups like
    // getActiveAssistantMessageId() check state.role === 'assistant')
    const uiRole: 'system' | 'user' | 'assistant' =
      role === 'user' || role === 'system' ? role : 'assistant'

    // Case 1: A manual message was created via startAssistantMessage()
    if (this.pendingManualMessageId) {
      const pendingId = this.pendingManualMessageId
      this.pendingManualMessageId = null

      // Rename the placeholder to the real provider id across every id-keyed
      // structure (no-op when they already match).
      this.renameMessageId(pendingId, messageId)

      // Ensure state exists
      if (!this.messageStates.has(messageId)) {
        this.createMessageState(messageId, uiRole)
        this.activeMessageIds.add(messageId)
      }

      this.emitMessagesChange()
      return
    }

    // Case 2: Message already exists (dedup)
    const existingMsg = this.messages.find((m) => m.id === messageId)
    if (existingMsg) {
      this.activeMessageIds.add(messageId)
      const existingState = this.messageStates.get(messageId)
      if (!existingState) {
        this.createMessageState(messageId, uiRole)
      } else {
        // If tool calls happened since last text, this TEXT_MESSAGE_START
        // signals a new text segment — reset segment accumulation
        if (existingState.hasToolCallsSinceTextStart) {
          if (
            existingState.currentSegmentText !== existingState.lastEmittedText
          ) {
            this.emitTextUpdateForMessage(messageId)
          }
          existingState.currentSegmentText = ''
          existingState.lastEmittedText = ''
          existingState.hasToolCallsSinceTextStart = false
        }
      }
      return
    }

    // Case 3: New message from the stream
    const newMessage: UIMessage = {
      id: messageId,
      role: uiRole,
      parts: [],
      createdAt: new Date(),
    }

    this.messages = [...this.messages, newMessage]
    this.createMessageState(messageId, uiRole)
    this.activeMessageIds.add(messageId)

    this.events.onStreamStart?.()
    this.emitMessagesChange()
  }

  /**
   * Handle TEXT_MESSAGE_END event
   */
  private handleTextMessageEndEvent(
    chunk: Extract<StreamChunk, { type: 'TEXT_MESSAGE_END' }>,
  ): void {
    const { messageId } = chunk
    const state = this.getMessageState(messageId)
    if (!state) return
    if (state.isComplete) return

    // Emit any pending text for this message
    if (state.currentSegmentText !== state.lastEmittedText) {
      this.emitTextUpdateForMessage(messageId)
    }

    // Complete all tool calls for this message
    this.completeAllToolCallsForMessage(messageId)
  }

  /**
   * Handle MESSAGES_SNAPSHOT event
   */
  private handleMessagesSnapshotEvent(
    chunk: Extract<StreamChunk, { type: 'MESSAGES_SNAPSHOT' }>,
  ): void {
    this.resetStreamState()
    // Normalize AG-UI snapshot messages to UIMessage[] so every message has a
    // `parts` array. AG-UI messages carry `content` but no `parts`, so casting
    // them directly to UIMessage[] is unsafe and causes "Cannot read properties
    // of undefined (reading 'find')" when code later reads message.parts (e.g.
    // the onToolCallStateChange devtools handler).
    //
    // The AG-UI `MESSAGES_SNAPSHOT` wire shape cannot reconstruct client-side
    // tool-call metadata a server may omit: a `role: 'tool'` message only carries
    // `toolCallId` + `content`, and an assistant message in the snapshot may
    // drop `toolCalls` the client already observed via `TOOL_CALL_*` events.
    // Without the matching `tool-call` part, later `addToolResult(toolCallId)`
    // calls cannot locate the call and warn + no-op (see #859). To keep the
    // UI representation consistent with the streaming fan-out and preserve the
    // unreconstructable metadata, reconcile the normalized snapshot against
    // the pre-snapshot state; see `reconcileSnapshotToolCalls`.
    const prevMessages = this.messages
    const normalized = chunk.messages.map(aguiSnapshotMessageToUIMessage)
    this.messages = this.reconcileSnapshotToolCalls(normalized, prevMessages)
    this.emitMessagesChange()
  }

  /**
   * Reconcile a freshly normalized snapshot with the pre-snapshot message
   * state so unreconstructable tool-call metadata is preserved.
   *
   * Post-pass (a): anchor `tool-result`-only assistant messages (the shape
   * `aguiSnapshotMessageToUIMessage` emits for AG-UI `role: 'tool'` wire
   * messages) into the message containing the matching `tool-call` part, or —
   * when the snapshot supplies no such part — the nearest earlier anchorable
   * assistant message, matching the in-stream fan-out shape
   * `assistant: [text, tool-call, tool-result, ...]`. Detached messages with
   * no earlier anchorable assistant are kept verbatim.
   *
   * Post-pass (b): when a `tool-result` part references a `toolCallId` whose
   * `tool-call` part is absent from the snapshot, carry the `tool-call` part
   * forward from the pre-snapshot state (state and output untouched) so a
   * subsequent `addToolResult(toolCallId)` can still locate the call.
   */
  private reconcileSnapshotToolCalls(
    snapshot: Array<UIMessage>,
    prevMessages: Array<UIMessage>,
  ): Array<UIMessage> {
    // Index tool-call parts observed before the snapshot by id so we can
    // restore metadata the snapshot cannot re-emit. Duplicate ids resolve
    // last-write-wins: the same tool call can appear in multiple messages
    // across reconnects, and the most recent part carries the freshest state.
    const prevToolCalls = new Map<string, ToolCallPart>()
    for (const msg of prevMessages) {
      for (const part of msg.parts) {
        if (part.type === 'tool-call') {
          prevToolCalls.set(part.id, part)
        }
      }
    }
    // Index tool-call parts already present in the snapshot so (b) only fills
    // genuine gaps rather than duplicating a tool-call the snapshot supplies.
    const snapshotToolCallIds = new Set<string>()
    for (const msg of snapshot) {
      for (const part of msg.parts) {
        if (part.type === 'tool-call') {
          snapshotToolCallIds.add(part.id)
        }
      }
    }

    const reconciled: Array<UIMessage> = []
    for (const msg of snapshot) {
      const toolResultPart =
        msg.role === 'assistant' && msg.parts.length === 1
          ? msg.parts.find((p): p is ToolResultPart => p.type === 'tool-result')
          : undefined

      if (!toolResultPart) {
        reconciled.push(msg)
        continue
      }

      // Prefer the message that actually contains the matching tool-call
      // part. AG-UI `reasoning`/`activity` messages also normalize to
      // `role: 'assistant'`, so anchoring into the nearest assistant alone
      // could separate a result from its call (and a later
      // `addToolResult(toolCallId)` would then append a duplicate result
      // next to the call).
      const target =
        reconciled.findLast((m) =>
          m.parts.some(
            (p) => p.type === 'tool-call' && p.id === toolResultPart.toolCallId,
          ),
        ) ??
        reconciled.findLast(
          (m) =>
            m.role === 'assistant' &&
            !(m.parts.length === 1 && m.parts[0]?.type === 'tool-result'),
        )

      if (!target) {
        // No assistant to anchor into — keep the detached message intact.
        if (!snapshotToolCallIds.has(toolResultPart.toolCallId)) {
          console.warn(
            `[StreamProcessor] MESSAGES_SNAPSHOT contains a tool-result for "${toolResultPart.toolCallId}" but no matching tool-call exists in the snapshot, and there is no assistant message to anchor into; addToolResult("${toolResultPart.toolCallId}") will not be able to locate this call`,
          )
        }
        reconciled.push(msg)
        continue
      }

      const parts = [...target.parts]
      // (b) Fill in a missing tool-call part from the pre-snapshot state when
      // the snapshot references its id via a tool-result but supplies no
      // tool-call metadata of its own.
      if (
        !snapshotToolCallIds.has(toolResultPart.toolCallId) &&
        !parts.some(
          (p) => p.type === 'tool-call' && p.id === toolResultPart.toolCallId,
        )
      ) {
        const prev = prevToolCalls.get(toolResultPart.toolCallId)
        if (prev) {
          // Insert the carried-over tool-call before its tool-result (pushed
          // below) so call→result ordering matches the streaming fan-out.
          parts.push({ ...prev })
          snapshotToolCallIds.add(prev.id)
        } else {
          console.warn(
            `[StreamProcessor] MESSAGES_SNAPSHOT contains a tool-result for "${toolResultPart.toolCallId}" but no matching tool-call exists in the snapshot or the pre-snapshot state; addToolResult("${toolResultPart.toolCallId}") will not be able to locate this call`,
          )
        }
      }
      parts.push(toolResultPart)
      // Replace rather than push into `target.parts`: a snapshot message that
      // arrived already carrying `parts` (TanStack server echoing UIMessages)
      // shares its array with the incoming chunk, and mutating it in place
      // would corrupt the caller's event object.
      target.parts = parts
    }

    return reconciled
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
    const { messageId, state } = this.ensureAssistantMessage(chunk.messageId)

    // Content arriving means all current tool calls for this message are complete
    this.completeAllToolCallsForMessage(messageId)

    if (this.structuredMessageIds.has(messageId)) {
      // `chunk.delta` is incremental; `chunk.content` is sometimes cumulative
      // (mirrors what the plain-text branch handles below). Reconcile against
      // the existing raw buffer so adapters that emit cumulative content
      // don't duplicate the JSON.
      let delta = chunk.delta || ''
      if (delta === '' && chunk.content !== undefined && chunk.content !== '') {
        const existingRaw = (
          this.messages
            .find((m) => m.id === messageId)
            ?.parts.find(
              (p): p is Extract<MessagePart, { type: 'structured-output' }> =>
                p.type === 'structured-output',
            ) ?? { raw: '' }
        ).raw
        if (chunk.content.startsWith(existingRaw)) {
          delta = chunk.content.slice(existingRaw.length)
        } else if (existingRaw.startsWith(chunk.content)) {
          delta = ''
        } else {
          delta = chunk.content
        }
      }
      if (delta !== '') {
        this.messages = appendStructuredOutputDelta(
          this.messages,
          messageId,
          delta,
        )
        state.totalTextContent += delta
        this.queueStructuredOutputUpdate(messageId, delta)
        this.emitMessagesChange()
      }
      return
    }

    const previousSegment = state.currentSegmentText

    // Detect if this is a NEW text segment (after tool calls) vs continuation
    const isNewSegment =
      state.hasToolCallsSinceTextStart &&
      previousSegment.length > 0 &&
      this.isNewTextSegment(chunk, previousSegment)

    if (isNewSegment) {
      // Emit any accumulated text before starting new segment
      if (previousSegment !== state.lastEmittedText) {
        this.emitTextUpdateForMessage(messageId)
      }
      // Reset SEGMENT text accumulation for the new text segment after tool calls
      state.currentSegmentText = ''
      state.lastEmittedText = ''
      state.hasToolCallsSinceTextStart = false
    }

    const currentText = state.currentSegmentText
    let nextText = currentText

    // Prefer delta over content - delta is the incremental change
    // Normalize to empty string to avoid "undefined" string concatenation
    const delta = chunk.delta || ''
    if (delta !== '') {
      nextText = currentText + delta
    } else if (chunk.content !== undefined && chunk.content !== '') {
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
    state.currentSegmentText = nextText
    state.totalTextContent += textDelta

    // Use delta for chunk strategy if available
    const chunkPortion = chunk.delta || chunk.content || ''
    const shouldEmit = this.chunkStrategy.shouldEmit(
      chunkPortion,
      state.currentSegmentText,
    )
    if (shouldEmit && state.currentSegmentText !== state.lastEmittedText) {
      this.emitTextUpdateForMessage(messageId)
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
    // Determine the message this tool call belongs to
    const targetMessageId =
      chunk.parentMessageId ?? this.getActiveAssistantMessageId()
    const { messageId, state } = this.ensureAssistantMessage(
      targetMessageId ?? undefined,
    )

    // Mark that we've seen tool calls since the last text segment
    state.hasToolCallsSinceTextStart = true

    const toolCallId = chunk.toolCallId
    const existingToolCall = state.toolCalls.get(toolCallId)

    if (!existingToolCall) {
      // New tool call starting
      const initialState: ToolCallState = 'awaiting-input'

      // `toolName` is a deprecated alias for `toolCallName` (see ToolCallStartEvent
      // in types.ts). Accept either so chunks from older code paths or any
      // adapter that only sets the deprecated field still produce a named part.
      // The type marks both as required strings, but in practice some emitters
      // only set one — fall back via the runtime value rather than the type.
      const toolName =
        (chunk as { toolCallName?: string }).toolCallName ?? chunk.toolName

      // Capture provider metadata that arrived on TOOL_CALL_START so it
      // round-trips back through the assistant message on the next turn
      // (e.g. Gemini's thoughtSignature).
      const chunkMetadata = chunk.metadata

      const newToolCall: InternalToolCallState = {
        id: chunk.toolCallId,
        name: toolName,
        arguments: '',
        state: initialState,
        parsedArguments: undefined,
        index: chunk.index ?? state.toolCalls.size,
        ...(chunkMetadata !== undefined && { metadata: chunkMetadata }),
      }

      state.toolCalls.set(toolCallId, newToolCall)
      state.toolCallOrder.push(toolCallId)

      // Store mapping for TOOL_CALL_ARGS/END routing
      this.toolCallToMessage.set(toolCallId, messageId)

      // Update UIMessage
      this.messages = updateToolCallPart(this.messages, messageId, {
        id: chunk.toolCallId,
        name: toolName,
        arguments: '',
        state: initialState,
        ...(chunkMetadata !== undefined && { metadata: chunkMetadata }),
      })
      this.emitMessagesChange()

      // Emit granular event
      this.events.onToolCallStateChange?.(
        messageId,
        chunk.toolCallId,
        initialState,
        '',
      )
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
    const messageId = this.toolCallToMessage.get(toolCallId)
    if (!messageId) return

    const state = this.getMessageState(messageId)
    if (!state) return

    const existingToolCall = state.toolCalls.get(toolCallId)
    if (!existingToolCall) return

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
    this.messages = updateToolCallPart(this.messages, messageId, {
      id: existingToolCall.id,
      name: existingToolCall.name,
      arguments: existingToolCall.arguments,
      state: existingToolCall.state,
    })
    this.emitMessagesChange()

    // Emit granular event
    this.events.onToolCallStateChange?.(
      messageId,
      existingToolCall.id,
      existingToolCall.state,
      existingToolCall.arguments,
    )
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
    const messageId = this.toolCallToMessage.get(chunk.toolCallId)
    if (!messageId) return

    const msgState = this.getMessageState(messageId)
    if (!msgState) return

    // Transition the tool call to input-complete (the authoritative completion signal)
    const existingToolCall = msgState.toolCalls.get(chunk.toolCallId)
    if (existingToolCall && existingToolCall.state !== 'input-complete') {
      // If TOOL_CALL_END provides parsed input and no TOOL_CALL_ARGS were
      // received, back-fill the arguments string so the UIMessage ToolCallPart
      // carries the correct value (defensive against adapters that skip ARGS).
      if (chunk.input !== undefined && !existingToolCall.arguments) {
        existingToolCall.arguments = JSON.stringify(chunk.input)
      }

      const index = msgState.toolCallOrder.indexOf(chunk.toolCallId)
      this.completeToolCall(messageId, index, existingToolCall)
      // If TOOL_CALL_END provides parsed input, use it as the canonical parsed
      // arguments (overrides the accumulated string parse from completeToolCall)
      if (chunk.input !== undefined) {
        existingToolCall.parsedArguments = chunk.input
      }
    }

    // Update UIMessage if there's a result
    if (chunk.result) {
      // Step 1: Update the tool-call part's output field (for UI consistency
      // with client tools — see GitHub issue #176)
      let output: unknown
      if (Array.isArray(chunk.result)) {
        output = chunk.result
      } else {
        try {
          output = JSON.parse(chunk.result)
        } catch {
          output = chunk.result
        }
      }
      this.messages = updateToolCallWithOutput(
        this.messages,
        chunk.toolCallId,
        output,
        chunk.state === 'output-error' ? 'error' : undefined,
      )

      // Step 2: Create/update the tool-result part (for LLM conversation history)
      const resultState: ToolResultState =
        chunk.state === 'output-error' ? 'error' : 'complete'
      this.messages = updateToolResultPart(
        this.messages,
        messageId,
        chunk.toolCallId,
        chunk.result,
        resultState,
        resultState === 'error'
          ? this.extractToolResultError(output)
          : undefined,
      )
      this.emitMessagesChange()
    }
  }

  private extractToolResultError(output: unknown): string {
    if (
      output &&
      typeof output === 'object' &&
      'error' in output &&
      typeof output.error === 'string'
    ) {
      return output.error
    }
    return typeof output === 'string' ? output : 'Tool execution failed'
  }

  /**
   * Handle TOOL_CALL_RESULT event (AG-UI spec).
   *
   * Creates a tool-result part and updates the tool-call output field,
   * mirroring the logic from TOOL_CALL_END when it carries a result.
   * This is the spec-compliant path for delivering tool results to the client.
   */
  private handleToolCallResultEvent(
    chunk: Extract<StreamChunk, { type: 'TOOL_CALL_RESULT' }>,
  ): void {
    const messageId = this.toolCallToMessage.get(chunk.toolCallId)
    if (!messageId) return

    // Step 1: Update the tool-call part's output field
    let output: unknown
    try {
      output = JSON.parse(chunk.content)
    } catch {
      output = chunk.content
    }
    this.messages = updateToolCallWithOutput(
      this.messages,
      chunk.toolCallId,
      output,
      chunk.state === 'output-error' ? 'error' : undefined,
    )

    // Step 2: Create/update the tool-result part
    const resultState: ToolResultState =
      chunk.state === 'output-error' ? 'error' : 'complete'
    this.messages = updateToolResultPart(
      this.messages,
      messageId,
      chunk.toolCallId,
      chunk.content,
      resultState,
      resultState === 'error' ? this.extractToolResultError(output) : undefined,
    )
    this.emitMessagesChange()
  }

  /**
   * Handle RUN_STARTED event.
   *
   * Registers the run so that RUN_FINISHED can determine whether other
   * runs are still active before finalizing.
   */
  private handleRunStartedEvent(
    chunk: Extract<StreamChunk, { type: 'RUN_STARTED' }>,
  ): void {
    this.activeRuns.add(chunk.runId)
  }

  /**
   * Handle RUN_FINISHED event.
   *
   * Records the finishReason and removes the run from activeRuns.
   * Only finalizes when no more runs are active, so that concurrent
   * runs don't interfere with each other.
   *
   * @see docs/chat-architecture.md#single-shot-tool-call-response — finishReason semantics
   * @see docs/chat-architecture.md#adapter-contract — Why RUN_FINISHED is mandatory
   */
  private handleRunFinishedEvent(
    chunk: Extract<StreamChunk, { type: 'RUN_FINISHED' }>,
  ): void {
    this.finishReason = chunk.finishReason ?? null
    this.activeRuns.delete(chunk.runId)

    if (this.activeRuns.size === 0) {
      this.isDone = true
      this.completeAllToolCalls()
      this.finalizeStream()
    }
  }

  /**
   * Handle RUN_ERROR event
   */
  private handleRunErrorEvent(
    chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
  ): void {
    this.hasError = true
    const runId =
      'runId' in chunk && typeof chunk.runId === 'string'
        ? chunk.runId
        : undefined
    if (runId) {
      this.activeRuns.delete(runId)
    } else {
      this.activeRuns.clear()
    }
    const { messageId } = this.ensureAssistantMessage()
    // Prefer spec field `message`; fall back to deprecated `error.message`.
    // If neither is set, the chunk still carries debug context (provider
    // error codes, request ids, etc.) — log it so the failure isn't silent.
    const errorMessage =
      chunk.message || chunk.error?.message || 'An error occurred'
    if (!chunk.message && !chunk.error?.message) {
      console.error(
        '[StreamProcessor] RUN_ERROR with no message; original chunk:',
        chunk,
      )
    }

    if (this.structuredMessageIds.has(messageId)) {
      this.flushStructuredOutputUpdate(messageId)
      this.messages = errorStructuredOutputPart(
        this.messages,
        messageId,
        errorMessage,
      )
      this.structuredMessageIds.delete(messageId)
      this.emitStructuredOutputChange(messageId, 'error')
      this.emitMessagesChange()
    }

    // Attach the provider's structured error body (`rawEvent`) and `code` to
    // the surfaced Error so consumers can recover the upstream detail that the
    // RUN_ERROR's `message` alone discards. Both are optional and added only
    // when present, keeping the Error backward compatible.
    const error = new Error(errorMessage)
    const code = chunk.code ?? chunk.error?.code
    if (code !== undefined) {
      Object.assign(error, { code })
    }
    if (chunk.rawEvent !== undefined) {
      Object.assign(error, { rawEvent: chunk.rawEvent })
    }
    this.events.onError?.(error)
  }

  /**
   * Handle STEP_STARTED event (for thinking/reasoning content).
   *
   * Records the stepId so that subsequent STEP_FINISHED deltas accumulate
   * into their own ThinkingPart. Does not create a message — the message
   * is lazily created when the first STEP_FINISHED content arrives.
   */
  private handleStepStartedEvent(
    chunk: Extract<StreamChunk, { type: 'STEP_STARTED' }>,
  ): void {
    const stepId = chunk.stepId ?? generateMessageId()
    const activeId = this.getActiveAssistantMessageId()
    if (activeId) {
      const state = this.getMessageState(activeId)
      if (state) {
        state.currentThinkingStepId = stepId
        if (!state.thinkingSteps.has(stepId)) {
          state.thinkingSteps.set(stepId, '')
          state.thinkingStepOrder.push(stepId)
        }
        // Clear any pending stepId from a prior STEP_STARTED that fired
        // before the assistant message existed. Now that we're tracking
        // the step directly on message state, the pending value is stale
        // and must not leak into the next STEP_FINISHED (which would
        // misattribute its delta to the stale step).
        this.pendingThinkingStepId = null
        return
      }
    }

    // No active message yet — defer until ensureAssistantMessage in STEP_FINISHED
    this.pendingThinkingStepId = stepId
  }

  /**
   * Handle STEP_FINISHED event (for thinking/reasoning content).
   *
   * Accumulates delta into the current thinking step's content and updates
   * the corresponding ThinkingPart in the UIMessage.
   *
   * @see docs/chat-architecture.md#thinkingreasoning-content — Thinking flow
   */
  private handleStepFinishedEvent(
    chunk: Extract<StreamChunk, { type: 'STEP_FINISHED' }>,
  ): void {
    const { messageId, state } = this.ensureAssistantMessage(
      this.getActiveAssistantMessageId() ?? undefined,
    )

    // During the transition period, adapters emit BOTH STEP_FINISHED and
    // REASONING_MESSAGE_CONTENT with the same delta. If we've already processed
    // REASONING_MESSAGE_CONTENT events for this message, skip the duplicate
    // thinking content from STEP_FINISHED to avoid doubled content.
    if (state.hasSeenReasoningEvents) {
      if (chunk.signature) {
        const stepId = state.currentThinkingStepId ?? chunk.stepId
        if (!stepId) return
        const thinking = state.thinkingSteps.get(stepId)
        if (thinking !== undefined) {
          state.thinkingStepSignatures.set(stepId, chunk.signature)
          this.messages = updateThinkingPart(
            this.messages,
            messageId,
            stepId,
            thinking,
            chunk.signature,
          )
          this.emitMessagesChange()
        }
      }
      return
    }

    this.consumePendingThinkingStep(state)

    const stepId =
      state.currentThinkingStepId ?? chunk.stepId ?? generateMessageId()

    // Auto-initialize if no prior STEP_STARTED (backward compat)
    if (!state.thinkingSteps.has(stepId)) {
      state.thinkingSteps.set(stepId, '')
      state.thinkingStepOrder.push(stepId)
      state.currentThinkingStepId = stepId
    }

    const previous = state.thinkingSteps.get(stepId) ?? ''
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

    state.thinkingSteps.set(stepId, nextThinking)

    if (chunk.signature) {
      state.thinkingStepSignatures.set(stepId, chunk.signature)
    }

    // Update UIMessage
    this.messages = updateThinkingPart(
      this.messages,
      messageId,
      stepId,
      nextThinking,
      state.thinkingStepSignatures.get(stepId),
    )
    this.emitMessagesChange()

    // Emit granular event
    this.events.onThinkingUpdate?.(messageId, stepId, nextThinking)
  }

  /**
   * Handle REASONING_MESSAGE_CONTENT event (AG-UI reasoning protocol).
   *
   * Accumulates reasoning delta into thinking content and updates the
   * corresponding ThinkingPart in the UIMessage.
   */
  private handleReasoningMessageContentEvent(
    chunk: Extract<StreamChunk, { type: 'REASONING_MESSAGE_CONTENT' }>,
  ): void {
    const { messageId, state } = this.ensureAssistantMessage(
      this.getActiveAssistantMessageId() ?? undefined,
    )

    state.hasSeenReasoningEvents = true
    const delta = chunk.delta || ''

    this.consumePendingThinkingStep(state)

    const stepId = state.currentThinkingStepId ?? chunk.messageId
    if (!state.thinkingSteps.has(stepId)) {
      state.thinkingSteps.set(stepId, '')
      state.thinkingStepOrder.push(stepId)
      state.currentThinkingStepId = stepId
    }

    const nextThinking = (state.thinkingSteps.get(stepId) ?? '') + delta
    state.thinkingSteps.set(stepId, nextThinking)

    this.messages = updateThinkingPart(
      this.messages,
      messageId,
      stepId,
      nextThinking,
      state.thinkingStepSignatures.get(stepId),
    )
    this.emitMessagesChange()

    this.events.onThinkingUpdate?.(messageId, stepId, nextThinking)
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
    const messageId = this.getActiveAssistantMessageId()

    if (chunk.name === 'structured-output.start' && chunk.value) {
      const v = chunk.value as { messageId?: string }
      const targetId = v.messageId ?? messageId
      if (targetId) {
        this.ensureAssistantMessage(targetId)
        this.structuredMessageIds.add(targetId)
        this.structuredOutputUpdateBatches.delete(targetId)
        this.events.onStructuredOutputChange?.({
          phase: 'start',
          messageId: targetId,
          status: 'streaming',
          raw: '',
        })
      }
      return
    }

    if (chunk.name === 'structured-output.complete' && chunk.value) {
      const v = chunk.value as {
        object: unknown
        raw?: string
        reasoning?: string
        messageId?: string
      }
      const targetId = v.messageId ?? messageId
      if (targetId) {
        this.flushStructuredOutputUpdate(targetId)
        this.messages = completeStructuredOutputPart(
          this.messages,
          targetId,
          v.object,
          v.raw ?? '',
          v.reasoning,
        )
        this.structuredMessageIds.delete(targetId)
        this.emitStructuredOutputChange(targetId, 'complete')
        this.emitMessagesChange()
      }
      // Fall through so user `onCustomEvent` callbacks still observe the event.
    }

    // Handle client tool input availability - trigger client-side execution
    if (chunk.name === 'tool-input-available' && chunk.value) {
      const { toolCallId, toolName, input } = chunk.value as {
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
      return
    }

    // Handle approval requests
    if (chunk.name === 'approval-requested' && chunk.value) {
      const { toolCallId, toolName, input, approval } = chunk.value as {
        toolCallId: string
        toolName: string
        input: any
        approval: { id: string; needsApproval: boolean }
      }

      // Resolve the message containing this tool call. After RUN_FINISHED,
      // activeMessageIds is cleared, so fall back to the toolCallToMessage map
      // which is populated during TOOL_CALL_START and preserved across finalize.
      const resolvedMessageId =
        messageId ?? this.toolCallToMessage.get(toolCallId)
      if (resolvedMessageId) {
        this.messages = updateToolCallApproval(
          this.messages,
          resolvedMessageId,
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
      return
    }

    // Handle MCP Apps ui-resource events — materialize a UIResourcePart on the
    // active assistant message. Never falls through to onCustomEvent because
    // ui-resource is a system event, not a user-defined custom event.
    if (chunk.name === 'ui-resource' && chunk.value) {
      const v: UIResourceEvent['value'] = chunk.value
      // Resolve the target assistant message. When a toolCallId is present, the
      // tool call's OWNER message is authoritative, so prefer it first; fall
      // back to the active assistant id only if the tool call isn't mapped.
      // This avoids misattaching the widget to a different active message in a
      // multi-message session.
      const resolvedMessageId =
        this.toolCallToMessage.get(v.toolCallId) ?? messageId
      if (resolvedMessageId) {
        const part: UIResourcePart = {
          type: 'ui-resource',
          resource: v.resource,
          toolCallId: v.toolCallId,
          toolName: v.toolName,
          ...(v.serverId !== undefined && { serverId: v.serverId }),
          ...(v.meta !== undefined && { meta: v.meta }),
        }
        this.messages = this.messages.map((msg) =>
          msg.id === resolvedMessageId
            ? { ...msg, parts: [...msg.parts, part] }
            : msg,
        )
        this.emitMessagesChange()
      } else {
        // No owner message and no active assistant id — the server read and
        // streamed a widget that has nowhere to attach (e.g. a toolCallId never
        // registered, or the event arrived after the run cleared its active
        // ids). Drop fail-soft, but warn: a vanished widget is otherwise
        // undebuggable from the client.
        console.warn(
          `[mcp-apps] dropped ui-resource: no target message for toolCallId "${v.toolCallId}" (toolName "${v.toolName}")`,
        )
      }
      return
    }

    // Forward non-system custom events to onCustomEvent callback
    if (this.events.onCustomEvent) {
      const toolCallId =
        chunk.value && typeof chunk.value === 'object'
          ? chunk.value.toolCallId
          : undefined
      this.events.onCustomEvent(chunk.name, chunk.value, { toolCallId })
    }
  }

  // ============================================
  // Internal Helpers
  // ============================================

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
   * Complete all tool calls across all active messages — safety net for stream termination.
   *
   * Called by RUN_FINISHED and finalizeStream(). Force-transitions any tool call
   * not yet in input-complete state. Handles cases where TOOL_CALL_END was
   * missed (adapter bug, network error, aborted stream).
   *
   * @see docs/chat-architecture.md#single-shot-tool-call-response — Safety net behavior
   */
  private completeAllToolCalls(): void {
    for (const messageId of this.activeMessageIds) {
      this.completeAllToolCallsForMessage(messageId)
    }
  }

  /**
   * Complete all tool calls for a specific message
   */
  private completeAllToolCallsForMessage(messageId: string): void {
    const state = this.getMessageState(messageId)
    if (!state) return

    state.toolCalls.forEach((toolCall, id) => {
      if (toolCall.state !== 'input-complete') {
        const index = state.toolCallOrder.indexOf(id)
        this.completeToolCall(messageId, index, toolCall)
      }
    })
  }

  /**
   * Mark a tool call as complete and emit event
   */
  private completeToolCall(
    messageId: string,
    _index: number,
    toolCall: InternalToolCallState,
  ): void {
    // Finalize the internal bookkeeping: the call's input arguments ARE
    // complete regardless of whether execution later failed, so the call still
    // counts as a completed tool call in getCompletedToolCalls()/getState().
    toolCall.state = 'input-complete'

    // Try final parse
    toolCall.parsedArguments = this.jsonParser.parse(toolCall.arguments)

    // Don't downgrade the rendered part of a call that already reached the
    // terminal 'error' state (e.g. an output-error TOOL_CALL_RESULT arrived
    // without a preceding TOOL_CALL_END). The RUN_FINISHED / finalizeStream
    // safety net must not clobber a failed call back to 'input-complete'.
    if (this.isToolCallPartErrored(toolCall.id)) {
      return
    }

    // Update UIMessage
    this.messages = updateToolCallPart(this.messages, messageId, {
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      state: 'input-complete',
      ...(toolCall.metadata !== undefined && { metadata: toolCall.metadata }),
    })
    this.emitMessagesChange()

    // Emit granular event
    this.events.onToolCallStateChange?.(
      messageId,
      toolCall.id,
      'input-complete',
      toolCall.arguments,
    )
  }

  /**
   * Whether the rendered tool-call part for the given id has reached the
   * terminal 'error' state. Used to prevent the completion safety net from
   * downgrading a failed call back to 'input-complete'.
   */
  private isToolCallPartErrored(toolCallId: string): boolean {
    // `initialMessages` may be ModelMessage-shaped (no `parts`) — e.g. the
    // common pattern of seeding a processor with the same messages passed to
    // `chat()`. Guard the access so iterating them never throws.
    return this.messages.some((msg) =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `parts` is typed as required, but seeded ModelMessage-shaped messages can lack it at runtime.
      msg.parts?.some(
        (part) =>
          part.type === 'tool-call' &&
          part.id === toolCallId &&
          part.state === 'error',
      ),
    )
  }

  /**
   * Emit pending text update for a specific message.
   *
   * Calls updateTextPart() which has critical append-vs-replace logic:
   * - If last UIMessage part is TextPart → replaces its content (same segment).
   * - If last part is anything else → pushes new TextPart (new segment after tools).
   *
   * @see docs/chat-architecture.md#uimessage-part-ordering-invariants — Replace vs. push logic
   */
  private emitTextUpdateForMessage(messageId: string): void {
    const state = this.getMessageState(messageId)
    if (!state) return

    state.lastEmittedText = state.currentSegmentText

    // Update UIMessage
    this.messages = updateTextPart(
      this.messages,
      messageId,
      state.currentSegmentText,
    )
    this.emitMessagesChange()

    // Emit granular event
    this.events.onTextUpdate?.(messageId, state.currentSegmentText)
  }

  private queueStructuredOutputUpdate(messageId: string, delta: string): void {
    const existing = this.structuredOutputUpdateBatches.get(messageId)
    const next = {
      delta: `${existing?.delta ?? ''}${delta}`,
      chunkCount: (existing?.chunkCount ?? 0) + 1,
    }

    this.structuredOutputUpdateBatches.set(messageId, next)

    if (next.chunkCount >= STRUCTURED_OUTPUT_UPDATE_BATCH_SIZE) {
      this.flushStructuredOutputUpdate(messageId)
    }
  }

  private flushStructuredOutputUpdate(messageId: string): void {
    const batch = this.structuredOutputUpdateBatches.get(messageId)
    if (!batch || batch.chunkCount === 0) return

    this.structuredOutputUpdateBatches.delete(messageId)
    this.emitStructuredOutputChange(messageId, 'update', batch.delta)
  }

  private emitStructuredOutputChange(
    messageId: string,
    phase: 'update' | 'complete' | 'error',
    delta?: string,
  ): void {
    const part = this.messages
      .find((message) => message.id === messageId)
      ?.parts.find(
        (
          messagePart,
        ): messagePart is Extract<MessagePart, { type: 'structured-output' }> =>
          messagePart.type === 'structured-output',
      )
    if (!part) return

    this.events.onStructuredOutputChange?.({
      phase,
      messageId,
      status: part.status,
      raw: part.raw,
      ...(part.partial !== undefined ? { partial: part.partial } : {}),
      ...(part.data !== undefined ? { data: part.data } : {}),
      ...(part.reasoning !== undefined ? { reasoning: part.reasoning } : {}),
      ...(part.errorMessage !== undefined
        ? { errorMessage: part.errorMessage }
        : {}),
      ...(delta !== undefined ? { delta } : {}),
    })
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
    let lastAssistantMessage: UIMessage | undefined

    // Finalize ALL active messages
    for (const messageId of this.activeMessageIds) {
      const state = this.getMessageState(messageId)
      if (!state) continue

      // Complete any remaining tool calls
      this.completeAllToolCallsForMessage(messageId)

      // Emit any pending text if not already emitted
      if (state.currentSegmentText !== state.lastEmittedText) {
        this.emitTextUpdateForMessage(messageId)
      }

      state.isComplete = true

      const msg = this.messages.find((m) => m.id === messageId)
      if (msg && msg.role === 'assistant') {
        lastAssistantMessage = msg
      }
    }

    // The stream closed but one or more structured-output runs never sent
    // their terminal `structured-output.complete`. Snap each lingering
    // streaming part to error so the UI doesn't appear to stream forever,
    // and drop the routing entries so a subsequent run on the same
    // processor instance (long-lived `subscribe()` mode) doesn't reuse
    // the stale ids.
    //
    // The iteration is unconditional w.r.t. `this.hasError` — RUN_ERROR
    // already removed its target messageId from `structuredMessageIds`
    // before reaching finalize, so anything still in the set is by
    // definition a non-errored, never-completed run (the multi-run case:
    // run-A errors, run-B is still streaming when finalize fires).
    for (const messageId of this.structuredMessageIds) {
      this.flushStructuredOutputUpdate(messageId)
      this.messages = errorStructuredOutputPart(
        this.messages,
        messageId,
        'Stream ended without structured-output.complete',
      )
      this.emitStructuredOutputChange(messageId, 'error')
    }
    this.structuredMessageIds.clear()
    this.structuredOutputUpdateBatches.clear()

    this.activeMessageIds.clear()

    // Remove whitespace-only assistant messages (handles models like Gemini
    // that sometimes return just "\n" during auto-continuation).
    // Preserve the message on errors so the UI can show error state.
    if (lastAssistantMessage && !this.hasError) {
      if (this.isWhitespaceOnlyMessage(lastAssistantMessage)) {
        this.messages = this.messages.filter(
          (m) => m.id !== lastAssistantMessage.id,
        )
        this.emitMessagesChange()
        return
      }
    }

    // Emit stream end for the last assistant message
    if (lastAssistantMessage) {
      this.events.onStreamEnd?.(lastAssistantMessage)
    }
  }

  /**
   * Get completed tool calls in API format (aggregated across all messages)
   */
  private getCompletedToolCalls(): Array<ToolCall> {
    const result: Array<ToolCall> = []
    for (const state of this.messageStates.values()) {
      for (const tc of state.toolCalls.values()) {
        if (tc.state === 'input-complete') {
          result.push({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
            // Preserve provider metadata (e.g. Gemini thoughtSignature) on
            // ProcessorResult.toolCalls so callers using process()/getResult()
            // get the same round-trip support as the streaming UI path.
            ...(tc.metadata !== undefined && { metadata: tc.metadata }),
          })
        }
      }
    }
    return result
  }

  /**
   * Get current result (aggregated across all messages)
   */
  private getResult(): ProcessorResult {
    const toolCalls = this.getCompletedToolCalls()
    let content = ''
    let thinking = ''

    for (const state of this.messageStates.values()) {
      content += state.totalTextContent
      for (const stepId of state.thinkingStepOrder) {
        thinking += state.thinkingSteps.get(stepId) ?? ''
      }
    }

    return {
      content,
      thinking: thinking || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: this.finishReason,
    }
  }

  /**
   * Get current processor state (aggregated across all messages)
   */
  getState(): ProcessorState {
    let content = ''
    let thinking = ''
    const toolCalls = new Map<string, InternalToolCallState>()
    const toolCallOrder: Array<string> = []

    for (const state of this.messageStates.values()) {
      content += state.totalTextContent
      for (const stepId of state.thinkingStepOrder) {
        thinking += state.thinkingSteps.get(stepId) ?? ''
      }
      for (const [id, tc] of state.toolCalls) {
        toolCalls.set(id, tc)
      }
      toolCallOrder.push(...state.toolCallOrder)
    }

    return {
      content,
      thinking,
      toolCalls,
      toolCallOrder,
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
    this.messageStates.clear()
    this.activeMessageIds.clear()
    this.activeRuns.clear()
    this.toolCallToMessage.clear()
    this.structuredMessageIds.clear()
    this.structuredOutputUpdateBatches.clear()
    this.pendingManualMessageId = null
    this.pendingThinkingStepId = null
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
    // eslint-disable-next-line @typescript-eslint/require-await -- async generator required by AsyncIterable contract; body has no await
    async *[Symbol.asyncIterator]() {
      for (const { chunk } of recording.chunks) {
        yield chunk
      }
    },
  }
}
