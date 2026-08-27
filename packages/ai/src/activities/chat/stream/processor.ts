import {
  aguiSnapshotMessageToUIMessage,
  coerceCreatedAt,
  generateMessageId,
  uiMessageToModelMessages,
} from '../messages.js'
import { runErrorEventToError } from '../../../utilities/errors'
import { isProviderExecutedToolCall } from '../../../utilities/provider-executed'
import {
  mergeMetadata,
  tanstackMetadata,
} from '../../../utilities/merge-metadata'
import { getChunkRunId } from '../../../utilities/chunk-ids'
import type { AdapterYieldChunk } from '../../../utilities/adapter-yield-chunk'
import { normalizeToolResult } from '../../../utilities/tool-result'
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
import { INTERRUPT_BINDING_METADATA_KEY } from '../../../interrupt-resume'
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
  Interrupt,
  MessagePart,
  ModelMessage,
  StreamChunk,
  ThinkingPart,
  ToolCall,
  ToolCallPart,
  ToolResultPart,
  UIMessage,
  UIResourceEvent,
  UIResourcePart,
} from '../../../types'

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

function interruptBatchHasGeneric(interrupts: Array<Interrupt>): boolean {
  return interrupts.some((interrupt) => {
    const metadata = interrupt.metadata
    const isInvalidMetadata =
      !metadata || typeof metadata !== 'object' || Array.isArray(metadata)
    if (isInvalidMetadata) {
      return false
    }
    const binding = metadata[INTERRUPT_BINDING_METADATA_KEY]
    return (
      binding !== null &&
      typeof binding === 'object' &&
      !Array.isArray(binding) &&
      binding.kind === 'generic'
    )
  })
}

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
  private streamEndEmitted = false

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

  setMessages(messages: Array<UIMessage>): void {
    this.messages = [...messages]
    this.emitMessagesChange()
  }

  addUserMessage(
    content: string | Array<ContentPart>,
    id?: string,
    metadata?: UIMessage['metadata'],
  ): UIMessage {
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
      ...(metadata != null ? { metadata } : {}),
    }

    this.messages = [...this.messages, userMessage]
    this.emitMessagesChange()

    return userMessage
  }

  prepareAssistantMessage(): void {
    // Reset stream state for new message
    this.resetStreamState()
  }

  startAssistantMessage(messageId?: string): string {
    this.prepareAssistantMessage()
    const { messageId: id } = this.ensureAssistantMessage(messageId)
    this.pendingManualMessageId = id
    return id
  }

  getCurrentAssistantMessageId(): string | null {
    let lastId: string | null = null
    for (const [id, state] of this.messageStates) {
      if (state.role === 'assistant') {
        lastId = id
      }
    }
    return lastId
  }

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

  addToolApprovalResponse(approvalId: string, approved: boolean): void {
    this.messages = updateToolCallApprovalResponse(
      this.messages,
      approvalId,
      approved,
    )
    this.emitMessagesChange()
  }

  toModelMessages(): Array<ModelMessage> {
    const modelMessages: Array<ModelMessage> = []
    for (const msg of this.messages) {
      modelMessages.push(...uiMessageToModelMessages(msg))
    }
    return modelMessages
  }

  getMessages(): Array<UIMessage> {
    return this.messages
  }

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

    return toolParts.every(
      (part) =>
        part.state === 'complete' ||
        part.state === 'approval-responded' ||
        (part.output !== undefined && !part.approval) ||
        toolResultIds.has(part.id) ||
        isProviderExecutedToolCall(part),
    )
  }

  removeMessagesAfter(index: number): void {
    const keptIds = new Set(this.messages.slice(0, index + 1).map((m) => m.id))
    for (const id of this.structuredMessageIds) {
      if (!keptIds.has(id)) this.structuredMessageIds.delete(id)
    }
    const structuredOutputUpdateBatchesKeys =
      this.structuredOutputUpdateBatches.keys()
    for (const id of structuredOutputUpdateBatchesKeys) {
      if (!keptIds.has(id)) this.structuredOutputUpdateBatches.delete(id)
    }
    const messageStatesKeys = this.messageStates.keys()
    for (const id of messageStatesKeys) {
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

  processChunk(chunk: StreamChunk): void {
    if (this.recording) {
      this.recording.chunks.push({
        chunk,
        timestamp: Date.now(),
        index: this.recording.chunks.length,
      })
    }
    if (!this.dispatchPrimaryProcessChunk(chunk)) {
      this.dispatchSecondaryProcessChunk(chunk)
    }
  }

  private dispatchPrimaryProcessChunk(chunk: StreamChunk): boolean {
    const c = chunk
    // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- AG-UI EventType enum members vs string-literal case labels; default branch handles untraced events.
    switch (c.type) {
      case 'TEXT_MESSAGE_START':
        this.handleTextMessageStartEvent(
          chunk as Extract<StreamChunk, { type: 'TEXT_MESSAGE_START' }>,
        )
        return true
      case 'TEXT_MESSAGE_CONTENT':
        this.handleTextMessageContentEvent(
          chunk as Extract<StreamChunk, { type: 'TEXT_MESSAGE_CONTENT' }>,
        )
        return true
      case 'TEXT_MESSAGE_END':
        this.handleTextMessageEndEvent(
          chunk as Extract<StreamChunk, { type: 'TEXT_MESSAGE_END' }>,
        )
        return true
      case 'TOOL_CALL_START':
        this.handleToolCallStartEvent(
          chunk as Extract<StreamChunk, { type: 'TOOL_CALL_START' }>,
        )
        return true
      case 'TOOL_CALL_ARGS':
        this.handleToolCallArgsEvent(
          chunk as Extract<StreamChunk, { type: 'TOOL_CALL_ARGS' }>,
        )
        return true
      case 'TOOL_CALL_END':
        this.handleToolCallEndEvent(
          chunk as Extract<StreamChunk, { type: 'TOOL_CALL_END' }>,
        )
        return true
      case 'RUN_FINISHED':
        this.handleRunFinishedEvent(
          chunk as Extract<StreamChunk, { type: 'RUN_FINISHED' }>,
        )
        return true
      case 'RUN_ERROR':
        this.handleRunErrorEvent(
          chunk as Extract<StreamChunk, { type: 'RUN_ERROR' }>,
        )
        return true
      case 'STEP_FINISHED':
        this.handleStepFinishedEvent(
          chunk as Extract<StreamChunk, { type: 'STEP_FINISHED' }>,
        )
        return true
      case 'MESSAGES_SNAPSHOT':
        this.handleMessagesSnapshotEvent(
          chunk as Extract<StreamChunk, { type: 'MESSAGES_SNAPSHOT' }>,
        )
        return true
      default:
        return false
    }
  }

  private dispatchSecondaryProcessChunk(chunk: StreamChunk): void {
    const c = chunk
    // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- AG-UI EventType enum members vs string-literal case labels; default branch handles untraced events.
    switch (c.type) {
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
        break
      case 'REASONING_MESSAGE_CONTENT':
        this.handleReasoningMessageContentEvent(
          chunk as Extract<StreamChunk, { type: 'REASONING_MESSAGE_CONTENT' }>,
        )
        break
      case 'REASONING_ENCRYPTED_VALUE':
        this.handleReasoningEncryptedValueEvent(
          chunk as Extract<StreamChunk, { type: 'REASONING_ENCRYPTED_VALUE' }>,
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
        break
    }
  }

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

  private getMessageState(messageId: string): MessageStreamState | undefined {
    return this.messageStates.get(messageId)
  }

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

  private getActiveAssistantMessageId(): string | null {
    // Set iteration is insertion-order; reverse-iterate to search from the end
    const ids = Array.from(this.activeMessageIds).reverse()
    for (const id of ids) {
      const state = this.messageStates.get(id)
      const isAssistant = state && state.role === 'assistant'
      if (isAssistant) {
        return id
      }
    }
    // finalizeStream() clears activeMessageIds but keeps messageStates.
    // Leftover reasoning after an early RUN_FINISHED must resume that
    // assistant. A new user turn calls prepareAssistantMessage(), which
    // clears messageStates first.
    for (const [id, state] of [...this.messageStates].reverse()) {
      if (state.role === 'assistant') {
        return id
      }
    }
    return null
  }

  private resumeAssistantState(id: string, state: MessageStreamState): void {
    this.activeMessageIds.add(id)
    if (state.isComplete || this.isDone) {
      state.isComplete = false
      this.isDone = false
    }
  }

  private ensureAssistantMessage(preferredId?: string): {
    messageId: string
    state: MessageStreamState
  } {
    // Try to find state by preferred ID
    if (preferredId) {
      const state = this.getMessageState(preferredId)
      if (state) {
        this.resumeAssistantState(preferredId, state)
        return { messageId: preferredId, state }
      }
    }

    // Try active assistant message
    const activeId = this.getActiveAssistantMessageId()
    if (activeId) {
      const state = this.getMessageState(activeId)
      if (state) {
        this.resumeAssistantState(activeId, state)
        return { messageId: activeId, state }
      }
    }

    // Check if a message with preferredId already exists (reconnect/resume case).
    // Hydrate transient state from the existing message instead of duplicating it.
    if (preferredId) {
      const existingMsg = this.messages.find((m) => m.id === preferredId)
      if (existingMsg) {
        const state = this.createMessageState(preferredId, existingMsg.role)
        this.activeMessageIds.add(preferredId)

        const lastPart =
          existingMsg.parts.length > 0
            ? existingMsg.parts[existingMsg.parts.length - 1]
            : null
        const isText = lastPart && lastPart.type === 'text'
        if (isText) {
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

  private mergeMessageMetadata(messageId: string, incoming: unknown): void {
    const isInvalidIncoming =
      incoming == null ||
      typeof incoming !== 'object' ||
      Array.isArray(incoming)
    if (isInvalidIncoming) {
      return
    }
    const message = this.messages.find((msg) => msg.id === messageId)
    if (!message) return

    const incomingRecord = incoming as NonNullable<UIMessage['metadata']>
    const incomingTanstack = tanstackMetadata(incomingRecord)
    const toMerge =
      incomingTanstack != null &&
      ('content' in incomingTanstack || 'args' in incomingTanstack)
        ? {
            ...incomingRecord,
            tanstack: Object.fromEntries(
              Object.entries(incomingTanstack).filter(
                ([key]) => key !== 'content' && key !== 'args',
              ),
            ),
          }
        : incomingRecord
    const metadata = mergeMetadata(message.metadata, toMerge)
    const createdAt = coerceCreatedAt(
      tanstackMetadata(incomingRecord)?.createdAt,
    )
    const createdAtValid = createdAt !== undefined
    this.messages = this.messages.map((msg) =>
      msg.id === messageId
        ? {
            ...msg,
            ...(metadata !== undefined ? { metadata } : {}),
            ...(createdAtValid ? { createdAt } : {}),
          }
        : msg,
    )
    this.emitMessagesChange()
  }

  private handleTextMessageStartEvent(
    chunk: Extract<StreamChunk, { type: 'TEXT_MESSAGE_START' }>,
  ): void {
    const { messageId, role } = chunk

    const uiRole: 'system' | 'user' | 'assistant' =
      role === 'user' || role === 'system' ? role : 'assistant'

    // Case 1: A manual message was created via startAssistantMessage()
    if (this.pendingManualMessageId) {
      const pendingId = this.pendingManualMessageId
      this.pendingManualMessageId = null

      if (pendingId !== messageId) {
        // Update the message's ID in the messages array
        this.messages = this.messages.map((msg) =>
          msg.id === pendingId ? { ...msg, id: messageId } : msg,
        )

        // Move state to the new key
        const existingState = this.messageStates.get(pendingId)
        if (existingState) {
          existingState.id = messageId
          this.messageStates.delete(pendingId)
          this.messageStates.set(messageId, existingState)
        }

        // Update activeMessageIds
        this.activeMessageIds.delete(pendingId)
        this.activeMessageIds.add(messageId)

        for (const [toolCallId, mappedMessageId] of this.toolCallToMessage) {
          if (mappedMessageId === pendingId) {
            this.toolCallToMessage.set(toolCallId, messageId)
          }
        }
      }

      // Ensure state exists
      let pendingState = this.messageStates.get(messageId)
      if (!pendingState) {
        pendingState = this.createMessageState(messageId, uiRole)
        this.activeMessageIds.add(messageId)
      } else if (pendingState.hasToolCallsSinceTextStart) {
        // A tool call (e.g. TOOL_CALL_START with parentMessageId) marked
        // this message before its "real" TEXT_MESSAGE_START arrived — same
        // reset Case 2 performs, so the segment accumulator doesn't carry
        // stale tool-call state into the text that follows.
        if (pendingState.currentSegmentText !== pendingState.lastEmittedText) {
          this.emitTextUpdateForMessage(messageId)
        }
        pendingState.currentSegmentText = ''
        pendingState.lastEmittedText = ''
        pendingState.hasToolCallsSinceTextStart = false
      }

      this.mergeMessageMetadata(messageId, chunk.metadata)
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
      this.mergeMessageMetadata(messageId, chunk.metadata)
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

    this.mergeMessageMetadata(messageId, chunk.metadata)
    this.events.onStreamStart?.()
    this.emitMessagesChange()
  }

  private handleTextMessageEndEvent(
    chunk: Extract<StreamChunk, { type: 'TEXT_MESSAGE_END' }>,
  ): void {
    const { messageId } = chunk
    this.mergeMessageMetadata(messageId, chunk.metadata)
    const state = this.getMessageState(messageId)
    if (!state) return
    if (state.isComplete) return

    // Emit any pending text for this message
    if (state.currentSegmentText !== state.lastEmittedText) {
      this.emitTextUpdateForMessage(messageId)
    }
  }

  private handleMessagesSnapshotEvent(
    chunk: Extract<StreamChunk, { type: 'MESSAGES_SNAPSHOT' }>,
  ): void {
    this.resetStreamState()
    const prevMessages = this.messages
    const prevById = new Map(prevMessages.map((msg) => [msg.id, msg]))
    const normalized = this.mergeReasoningFanOut(
      chunk.messages.map(aguiSnapshotMessageToUIMessage),
    )
    this.messages = this.reconcileSnapshotToolCalls(
      normalized,
      prevMessages,
    ).map((msg) => {
      if (msg.metadata != null) return msg
      const prev = prevById.get(msg.id)
      if (prev?.metadata == null) return msg
      return { ...msg, metadata: prev.metadata }
    })
    this.emitMessagesChange()
  }

  private mergeReasoningFanOut(messages: Array<UIMessage>): Array<UIMessage> {
    const out: Array<UIMessage> = []
    let pending: Array<UIMessage> = []
    const thinkingParts = (msg: UIMessage) =>
      msg.parts.filter((part): part is ThinkingPart => part.type === 'thinking')
    const isThinkingOnly = (msg: UIMessage) =>
      msg.role === 'assistant' &&
      msg.parts.length > 0 &&
      msg.parts.every((part) => part.type === 'thinking')
    const isToolResultOnly = (msg: UIMessage) =>
      msg.role === 'assistant' &&
      msg.parts.some((part) => part.type === 'tool-result') &&
      msg.parts.every(
        (part) => part.type === 'tool-result' || part.type === 'ui-resource',
      )
    const flushPending = () => {
      out.push(...pending)
      pending = []
    }
    for (const msg of messages) {
      if (isThinkingOnly(msg)) {
        pending.push(msg)
        continue
      }
      const hasMsg =
        msg.role === 'assistant' && pending.length > 0 && !isToolResultOnly(msg)
      if (hasMsg) {
        out.push({
          ...msg,
          parts: [...pending.flatMap(thinkingParts), ...msg.parts],
        })
        pending = []
        continue
      }
      flushPending()
      out.push(msg)
    }
    flushPending()
    return out
  }

  private reconcileSnapshotToolCalls(
    snapshot: Array<UIMessage>,
    prevMessages: Array<UIMessage>,
  ): Array<UIMessage> {
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
      const toolResultParts = msg.parts.filter(
        (part): part is ToolResultPart => part.type === 'tool-result',
      )
      const toolResultPart =
        msg.role === 'assistant' &&
        toolResultParts.length === 1 &&
        msg.parts.every(
          (part) => part.type === 'tool-result' || part.type === 'ui-resource',
        )
          ? toolResultParts[0]
          : undefined

      if (!toolResultPart) {
        reconciled.push(msg)
        continue
      }

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
      const isToolCall =
        !snapshotToolCallIds.has(toolResultPart.toolCallId) &&
        !parts.some(
          (p) => p.type === 'tool-call' && p.id === toolResultPart.toolCallId,
        )
      if (isToolCall) {
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
      parts.push(...msg.parts)
      target.parts = parts
    }

    return this.enrichSnapshotToolCallsFromResults(reconciled, prevToolCalls)
  }

  private enrichSnapshotToolCallsFromResults(
    messages: Array<UIMessage>,
    prevToolCalls: Map<string, ToolCallPart>,
  ): Array<UIMessage> {
    const resultsByCallId = new Map<string, ToolResultPart>()
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === 'tool-result') {
          resultsByCallId.set(part.toolCallId, part)
        }
      }
    }

    return messages.map((msg) => {
      const parts = msg.parts.map((part) => {
        if (part.type !== 'tool-call') return part

        const prev = prevToolCalls.get(part.id)
        const result = resultsByCallId.get(part.id)
        let next: ToolCallPart = part

        // Prefer a pre-snapshot call that already carried output/complete —
        // the client observed TOOL_CALL_END/RESULT before the snapshot wipe.
        const isIncompletePrev =
          prev &&
          (prev.output !== undefined ||
            prev.state === 'complete' ||
            prev.state === 'error') &&
          (part.output === undefined ||
            part.state === 'input-complete' ||
            part.state === 'input-streaming' ||
            part.state === 'awaiting-input')
        if (isIncompletePrev) {
          next = {
            ...part,
            ...(prev.output !== undefined ? { output: prev.output } : {}),
            state: prev.state,
            ...(prev.approval !== undefined ? { approval: prev.approval } : {}),
            ...(prev.metadata !== undefined ? { metadata: prev.metadata } : {}),
          }
        }

        // Apply sibling tool-result when the call still has no output.
        const hasResult = result && next.output === undefined
        if (hasResult) {
          let output: unknown
          if (Array.isArray(result.content)) {
            output = result.content
          } else {
            try {
              output = JSON.parse(result.content)
            } catch {
              output = result.content
            }
          }
          const errorText =
            result.state === 'error'
              ? this.extractToolResultError(output)
              : undefined
          next = {
            ...next,
            output: errorText ? { error: errorText } : output,
            state: result.state === 'error' ? 'error' : 'complete',
          }
        }

        return next
      })
      // Rebuild only when a part object identity changed.
      const partsChanged = parts.some(
        (part, index) => part !== msg.parts[index],
      )
      return partsChanged ? { ...msg, parts } : msg
    })
  }

  private handleTextMessageContentEvent(
    chunk: Extract<StreamChunk, { type: 'TEXT_MESSAGE_CONTENT' }>,
  ): void {
    const { messageId, state } = this.ensureAssistantMessage(chunk.messageId)
    this.mergeMessageMetadata(messageId, chunk.metadata)

    if (this.structuredMessageIds.has(messageId)) {
      const delta = chunk.delta || ''
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
    const delta = chunk.delta || ''
    const nextText = delta !== '' ? currentText + delta : currentText

    // Calculate the delta for totalTextContent
    const textDelta = nextText.slice(currentText.length)
    state.currentSegmentText = nextText
    state.totalTextContent += textDelta

    const chunkPortion = chunk.delta || ''
    const shouldEmit = this.chunkStrategy.shouldEmit(
      chunkPortion,
      state.currentSegmentText,
    )
    const shouldEmit2 =
      shouldEmit && state.currentSegmentText !== state.lastEmittedText
    if (shouldEmit2) {
      this.emitTextUpdateForMessage(messageId)
    }
  }

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

      const toolName = chunk.toolCallName

      const chunkMetadata = chunk.metadata

      const newToolCall: InternalToolCallState = {
        id: chunk.toolCallId,
        name: toolName,
        arguments: '',
        state: initialState,
        parsedArguments: undefined,
        index: state.toolCalls.size,
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
    const hasWasAwaitingInput = wasAwaitingInput && chunk.delta
    if (hasWasAwaitingInput) {
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

  private handleToolCallEndEvent(
    chunk: Extract<StreamChunk, { type: 'TOOL_CALL_END' }>,
  ): void {
    const messageId = this.toolCallToMessage.get(chunk.toolCallId)
    if (!messageId) return

    const msgState = this.getMessageState(messageId)
    if (!msgState) return

    // The parsed input can ride on the spec `input` field or, for adapters
    // that only stamp it into TanStack metadata, on `metadata.tanstack.input`.
    const input =
      chunk.input !== undefined
        ? chunk.input
        : (tanstackMetadata(chunk)?.input as unknown)

    // Transition the tool call to input-complete (the authoritative completion signal)
    const existingToolCall = msgState.toolCalls.get(chunk.toolCallId)
    const hasExistingToolCall =
      existingToolCall && existingToolCall.state !== 'input-complete'
    if (hasExistingToolCall) {
      const hasInput = input !== undefined && !existingToolCall.arguments
      if (hasInput) {
        try {
          existingToolCall.arguments = JSON.stringify(input)
        } catch {
          // circular refs, BigInt, etc. — leave arguments empty rather than
          // aborting stream processing
        }
      }

      const index = msgState.toolCallOrder.indexOf(chunk.toolCallId)
      this.completeToolCall(messageId, index, existingToolCall)

      if (input !== undefined) {
        existingToolCall.parsedArguments = input
        this.messages = updateToolCallPart(this.messages, messageId, {
          id: existingToolCall.id,
          name: existingToolCall.name,
          arguments: existingToolCall.arguments,
          state: 'input-complete',
          input,
          ...(existingToolCall.metadata !== undefined && {
            metadata: existingToolCall.metadata,
          }),
        })
        this.emitMessagesChange()
      }
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

  private handleToolCallResultEvent(
    chunk: Extract<StreamChunk, { type: 'TOOL_CALL_RESULT' }>,
  ): void {
    const messageId =
      this.toolCallToMessage.get(chunk.toolCallId) ??
      this.messages.find((m) =>
        m.parts.some(
          (p): p is ToolCallPart =>
            p.type === 'tool-call' && p.id === chunk.toolCallId,
        ),
      )?.id
    if (!messageId) return

    const extra = chunk as AdapterYieldChunk
    const isOutputError =
      extra.state === 'output-error' ||
      tanstackMetadata(chunk)?.state === 'output-error'

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
      isOutputError ? 'error' : undefined,
    )

    // Step 2: Create/update the tool-result part
    const resultState: ToolResultState = isOutputError ? 'error' : 'complete'
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

  private handleRunStartedEvent(
    chunk: Extract<StreamChunk, { type: 'RUN_STARTED' }>,
  ): void {
    this.activeRuns.add(chunk.runId)
  }

  private handleRunFinishedEvent(
    chunk: Extract<StreamChunk, { type: 'RUN_FINISHED' }>,
  ): void {
    const extra = chunk as AdapterYieldChunk
    this.finishReason =
      extra.finishReason !== undefined
        ? extra.finishReason
        : (tanstackMetadata(chunk)?.finishReason ?? null)
    this.activeRuns.delete(chunk.runId)

    if (chunk.outcome?.type === 'interrupt') {
      this.handleInterrupts(chunk.outcome.interrupts)
    }

    if (this.activeRuns.size === 0) {
      this.completeAllToolCalls()
      const isIntermediateToolTurn =
        this.finishReason === 'tool_calls' &&
        chunk.outcome?.type !== 'interrupt'
      if (isIntermediateToolTurn) {
        return
      }
      this.isDone = true
      this.finalizeStream()
    }
  }

  private handleInterrupts(interrupts: Array<Interrupt>): void {
    const hasGeneric = interruptBatchHasGeneric(interrupts)
    for (const interrupt of interrupts) {
      const metadata =
        interrupt.metadata && typeof interrupt.metadata === 'object'
          ? interrupt.metadata
          : {}
      const kind = typeof metadata.kind === 'string' ? metadata.kind : undefined
      const toolCallId = interrupt.toolCallId
      if (!toolCallId) continue

      const toolName =
        typeof metadata.toolName === 'string'
          ? metadata.toolName
          : this.findToolCallName(toolCallId)
      const input = Object.hasOwn(metadata, 'input') ? metadata.input : {}

      const hasKind =
        kind === 'approval' || interrupt.reason === 'approval_required'
      if (hasKind) {
        const resolvedMessageId =
          this.getActiveAssistantMessageId() ??
          this.toolCallToMessage.get(toolCallId) ??
          this.messages.find(
            (m) =>
              m.role === 'assistant' &&
              m.parts.some(
                (p) => p.type === 'tool-call' && p.id === toolCallId,
              ),
          )?.id
        if (resolvedMessageId) {
          this.messages = updateToolCallApproval(
            this.messages,
            resolvedMessageId,
            toolCallId,
            interrupt.id,
          )
          this.emitMessagesChange()
        }

        this.events.onApprovalRequest?.({
          toolCallId,
          toolName,
          input,
          approvalId: interrupt.id,
        })
        continue
      }

      const hasKind2 =
        kind === 'client_tool' || interrupt.reason === 'client_tool_input'
      if (hasKind2) {
        // Generic interrupts in the same batch decide `toolResume`. Do not
        // run client tools until that policy is `continue`.
        if (hasGeneric) continue
        this.events.onToolCall?.({
          toolCallId,
          toolName,
          input,
        })
      }
    }
  }

  private findToolCallName(toolCallId: string): string {
    const messageStates = this.messageStates.values()
    for (const state of messageStates) {
      const toolCall = state.toolCalls.get(toolCallId)
      if (toolCall) return toolCall.name
    }
    return ''
  }

  private handleRunErrorEvent(
    chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
  ): void {
    this.hasError = true
    const runId = getChunkRunId(chunk)
    if (runId) {
      this.activeRuns.delete(runId)
    } else {
      this.activeRuns.clear()
    }
    const { messageId } = this.ensureAssistantMessage()
    const errorMessage = chunk.message || 'An error occurred'
    if (!chunk.message) {
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

    this.events.onError?.(runErrorEventToError(chunk))
  }

  private handleStepStartedEvent(
    chunk: Extract<StreamChunk, { type: 'STEP_STARTED' }>,
  ): void {
    const stepId = chunk.stepName || generateMessageId()
    const activeId = this.getActiveAssistantMessageId()
    if (activeId) {
      const state = this.getMessageState(activeId)
      if (state) {
        state.currentThinkingStepId = stepId
        if (!state.thinkingSteps.has(stepId)) {
          state.thinkingSteps.set(stepId, '')
          state.thinkingStepOrder.push(stepId)
        }
        this.pendingThinkingStepId = null
        return
      }
    }

    // No active message yet — defer until ensureAssistantMessage in
    // REASONING_MESSAGE_CONTENT
    this.pendingThinkingStepId = stepId
  }

  private handleStepFinishedEvent(
    chunk: Extract<StreamChunk, { type: 'STEP_FINISHED' }>,
  ): void {
    const extra = chunk as AdapterYieldChunk
    const signature = extra.signature
    if (!signature) return

    const { messageId, state } = this.ensureAssistantMessage(
      this.getActiveAssistantMessageId() ?? undefined,
    )
    const stepId = state.currentThinkingStepId ?? extra.stepId
    if (!stepId) return
    const thinking = state.thinkingSteps.get(stepId)
    if (thinking === undefined) return

    state.thinkingStepSignatures.set(stepId, signature)
    this.messages = updateThinkingPart(
      this.messages,
      messageId,
      stepId,
      thinking,
      signature,
    )
    this.emitMessagesChange()
  }

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

  private handleReasoningEncryptedValueEvent(
    chunk: Extract<StreamChunk, { type: 'REASONING_ENCRYPTED_VALUE' }>,
  ): void {
    const encryptedValue = chunk.encryptedValue
    const isInvalidEncryptedValue =
      typeof encryptedValue !== 'string' || encryptedValue === ''
    if (isInvalidEncryptedValue) return

    if (chunk.subtype === 'tool-call') {
      this.attachToolCallSignature(chunk.entityId, encryptedValue)
      return
    }

    const { messageId, state } = this.ensureAssistantMessage(
      this.getActiveAssistantMessageId() ?? undefined,
    )
    const stepId = state.currentThinkingStepId ?? chunk.entityId
    state.thinkingStepSignatures.set(stepId, encryptedValue)
    const content = state.thinkingSteps.get(stepId) ?? ''
    if (!state.thinkingSteps.has(stepId)) {
      state.thinkingSteps.set(stepId, content)
      state.thinkingStepOrder.push(stepId)
    }
    this.messages = updateThinkingPart(
      this.messages,
      messageId,
      stepId,
      content,
      encryptedValue,
    )
    this.emitMessagesChange()
  }

  private attachToolCallSignature(
    toolCallId: string,
    thoughtSignature: string,
  ): void {
    this.messages = this.messages.map((msg) => {
      let changed = false
      const parts = msg.parts.map((part) => {
        const shouldSkipPart =
          part.type !== 'tool-call' || part.id !== toolCallId
        if (shouldSkipPart) return part
        changed = true
        return {
          ...part,
          metadata: {
            ...(part.metadata != null && typeof part.metadata === 'object'
              ? part.metadata
              : {}),
            thoughtSignature,
          },
        }
      })
      return changed ? { ...msg, parts } : msg
    })
    const messageStates = this.messageStates.values()
    for (const state of messageStates) {
      const call = state.toolCalls.get(toolCallId)
      if (!call) continue
      call.metadata = {
        ...(call.metadata ?? {}),
        thoughtSignature,
      }
    }
    this.emitMessagesChange()
  }

  private handleCustomEvent(
    chunk: Extract<StreamChunk, { type: 'CUSTOM' }>,
  ): void {
    const messageId = this.getActiveAssistantMessageId()
    const isStructuredOutputStart =
      chunk.name === 'structured-output.start' && chunk.value
    if (isStructuredOutputStart) {
      this.handleStructuredOutputStartEvent(chunk, messageId)
      return
    }
    const isStructuredOutputComplete =
      chunk.name === 'structured-output.complete' && chunk.value
    if (isStructuredOutputComplete) {
      this.handleStructuredOutputCompleteEvent(chunk, messageId)
    }
    const isToolInputAvailable =
      chunk.name === 'tool-input-available' && chunk.value
    if (isToolInputAvailable) {
      this.handleToolInputAvailableEvent(chunk)
      return
    }
    const isApprovalRequested =
      chunk.name === 'approval-requested' && chunk.value
    if (isApprovalRequested) {
      this.handleApprovalRequestedEvent(chunk, messageId)
      return
    }
    const isUiResource = chunk.name === 'ui-resource' && chunk.value
    if (isUiResource) {
      this.handleUiResourceEvent(chunk, messageId)
      return
    }
    if (this.events.onCustomEvent) {
      const toolCallId =
        chunk.value && typeof chunk.value === 'object'
          ? chunk.value.toolCallId
          : undefined
      this.events.onCustomEvent(chunk.name, chunk.value, { toolCallId })
    }
  }

  private handleStructuredOutputStartEvent(
    chunk: Extract<StreamChunk, { type: 'CUSTOM' }>,
    messageId: string | null,
  ): void {
    const v = chunk.value as { messageId?: string }
    const { messageId: targetId } = this.ensureAssistantMessage(
      v.messageId ?? messageId ?? undefined,
    )
    if (!targetId) return
    this.structuredMessageIds.add(targetId)
    this.structuredOutputUpdateBatches.delete(targetId)
    this.events.onStructuredOutputChange?.({
      phase: 'start',
      messageId: targetId,
      status: 'streaming',
      raw: '',
    })
  }

  private handleStructuredOutputCompleteEvent(
    chunk: Extract<StreamChunk, { type: 'CUSTOM' }>,
    messageId: string | null,
  ): void {
    const v = chunk.value as {
      object: unknown
      raw?: string
      reasoning?: string
      messageId?: string
    }
    const { messageId: targetId } = this.ensureAssistantMessage(
      v.messageId ?? messageId ?? undefined,
    )
    if (!targetId) return
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

  private handleToolInputAvailableEvent(
    chunk: Extract<StreamChunk, { type: 'CUSTOM' }>,
  ): void {
    const { toolCallId, toolName, input } = chunk.value as {
      toolCallId: string
      toolName: string
      input: any
    }
    this.events.onToolCall?.({
      toolCallId,
      toolName,
      input,
    })
  }

  private handleApprovalRequestedEvent(
    chunk: Extract<StreamChunk, { type: 'CUSTOM' }>,
    messageId: string | null,
  ): void {
    const { toolCallId, toolName, input, approval } = chunk.value as {
      toolCallId: string
      toolName: string
      input: any
      approval: { id: string; needsApproval: boolean }
    }
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
    this.events.onApprovalRequest?.({
      toolCallId,
      toolName,
      input,
      approvalId: approval.id,
    })
  }

  private handleUiResourceEvent(
    chunk: Extract<StreamChunk, { type: 'CUSTOM' }>,
    messageId: string | null,
  ): void {
    const v: UIResourceEvent['value'] = chunk.value
    const resolvedMessageId =
      this.toolCallToMessage.get(v.toolCallId) ?? messageId
    if (!resolvedMessageId) {
      console.warn(
        `[mcp-apps] dropped ui-resource: no target message for toolCallId "${v.toolCallId}" (toolName "${v.toolName}")`,
      )
      return
    }
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
  }

  private isNewTextSegment(
    _chunk: Extract<StreamChunk, { type: 'TEXT_MESSAGE_CONTENT' }>,
    _previous: string,
  ): boolean {
    return true
  }

  private completeAllToolCalls(): void {
    for (const messageId of this.activeMessageIds) {
      this.completeAllToolCallsForMessage(messageId)
    }
  }

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

  private completeToolCall(
    messageId: string,
    _index: number,
    toolCall: InternalToolCallState,
  ): void {
    toolCall.state = 'input-complete'

    let strictParseSucceeded = false
    try {
      toolCall.parsedArguments = JSON.parse(toolCall.arguments)
      strictParseSucceeded = true
    } catch {
      toolCall.parsedArguments = undefined
    }

    if (this.isToolCallPartErrored(toolCall.id)) {
      return
    }

    if (this.isToolCallPartAwaitingUserAction(toolCall.id)) {
      return
    }

    // Update UIMessage. The arguments are complete now, so surface the parsed
    // input on the part from the accumulated TOOL_CALL_ARGS deltas.
    this.messages = updateToolCallPart(this.messages, messageId, {
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      state: 'input-complete',
      ...(strictParseSucceeded && { input: toolCall.parsedArguments }),
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

  private isToolCallPartAwaitingUserAction(toolCallId: string): boolean {
    return this.messages.some((msg) =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `parts` is typed as required, but seeded ModelMessage-shaped messages can lack it at runtime.
      msg.parts?.some(
        (part) =>
          part.type === 'tool-call' &&
          part.id === toolCallId &&
          (part.state === 'approval-requested' ||
            part.state === 'approval-responded'),
      ),
    )
  }

  private isToolCallPartErrored(toolCallId: string): boolean {
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
    const shouldSkipBatch = !batch || batch.chunkCount === 0
    if (shouldSkipBatch) return

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

  private emitMessagesChange(): void {
    this.events.onMessagesChange?.([...this.messages])
  }

  finalizeStream(): void {
    this.isDone = true
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
    if (lastAssistantMessage && !this.streamEndEmitted) {
      this.streamEndEmitted = true
      this.events.onStreamEnd?.(lastAssistantMessage)
    }
  }

  private getCompletedToolCalls(): Array<ToolCall> {
    const result: Array<ToolCall> = []
    const messageStates = this.messageStates.values()
    for (const state of messageStates) {
      const toolCalls = state.toolCalls.values()
      for (const tc of toolCalls) {
        if (tc.state === 'input-complete') {
          result.push({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
            ...(tc.metadata !== undefined && { metadata: tc.metadata }),
          })
        }
      }
    }
    return result
  }

  private getResult(): ProcessorResult {
    const toolCalls = this.getCompletedToolCalls()
    let content = ''
    let thinking = ''

    const messageStates = this.messageStates.values()
    for (const state of messageStates) {
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

  getState(): ProcessorState {
    let content = ''
    let thinking = ''
    const toolCalls = new Map<string, InternalToolCallState>()
    const toolCallOrder: Array<string> = []

    const messageStates = this.messageStates.values()
    for (const state of messageStates) {
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

  startRecording(): void {
    this.recordingEnabled = true
    this.recordingStartTime = Date.now()
    this.recording = {
      version: '1.0',
      timestamp: this.recordingStartTime,
      chunks: [],
    }
  }

  getRecording(): ChunkRecording | null {
    return this.recording
  }

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
    this.streamEndEmitted = false
    this.chunkStrategy.reset?.()
  }

  reset(): void {
    this.resetStreamState()
    this.messages = []
  }

  private isWhitespaceOnlyMessage(message: UIMessage): boolean {
    if (message.parts.length === 0) return false
    return message.parts.every(
      (part) => part.type === 'text' && part.content.trim() === '',
    )
  }

  static async replay(
    recording: ChunkRecording,
    options?: StreamProcessorOptions,
  ): Promise<ProcessorResult> {
    const processor = new StreamProcessor(options)
    return processor.process(createReplayStream(recording))
  }
}

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
