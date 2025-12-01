/**
 * Unified Stream Processor
 *
 * Core stream processing engine used by both server and client.
 * Handles:
 * - Text content accumulation with configurable chunking strategies
 * - Parallel tool calls with lifecycle state tracking
 * - Thinking/reasoning content
 * - Recording/replay for testing
 */

import { defaultJSONParser } from './json-parser'
import { ImmediateStrategy } from './strategies'
import type {
  ChunkRecording,
  ChunkStrategy,
  InternalToolCallState,
  ProcessorResult,
  ProcessorState,
  StreamProcessorHandlers,
  StreamProcessorOptions,
  ToolCallState,
  ToolResultState,
} from './types'
import type { StreamChunk, ToolCall } from '../types'

/**
 * StreamProcessor - State machine for processing AI response streams
 *
 * State tracking:
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
  private handlers: StreamProcessorHandlers
  private jsonParser: { parse: (jsonString: string) => any }
  private recordingEnabled: boolean

  // State
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
  // This is needed to detect when we should start a new text segment
  private hasToolCallsSinceTextStart = false

  // Recording
  private recording: ChunkRecording | null = null
  private recordingStartTime = 0

  constructor(options: StreamProcessorOptions = {}) {
    this.chunkStrategy = options.chunkStrategy || new ImmediateStrategy()
    this.handlers = options.handlers || {}
    this.jsonParser = options.jsonParser || defaultJSONParser
    this.recordingEnabled = options.recording ?? false
  }

  /**
   * Process a stream and emit events through handlers
   */
  async process(stream: AsyncIterable<any>): Promise<ProcessorResult> {
    // Reset state
    this.reset()

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
    // A new segment is detected when:
    // 1. We've had tool calls since text started
    // 2. We have existing text content
    // 3. The incoming content doesn't look like a continuation
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
      // But keep totalTextContent - it accumulates across all segments
      this.currentSegmentText = ''
      this.lastEmittedText = ''
      this.hasToolCallsSinceTextStart = false
    }

    const currentText = this.currentSegmentText
    let nextText = currentText

    // Prefer delta over content - delta is the incremental change
    if (chunk.delta !== undefined && chunk.delta !== '') {
      nextText = currentText + chunk.delta
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
    this.currentSegmentText = nextText
    this.totalTextContent += textDelta

    // Use delta for chunk strategy if available
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

      // Emit lifecycle event
      this.handlers.onToolCallStart?.(
        actualIndex,
        chunk.toolCall.id,
        chunk.toolCall.function.name,
      )

      // Emit state change event
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

      // Emit state change event
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
    }
  }

  /**
   * Handle a tool result chunk
   */
  private handleToolResultChunk(
    chunk: Extract<StreamChunk, { type: 'tool_result' }>,
  ): void {
    const state: ToolResultState = 'complete'
    this.handlers.onToolResultStateChange?.(
      chunk.toolCallId,
      chunk.content,
      state,
    )
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
    this.handlers.onError?.(chunk.error)
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
    if (chunk.delta !== undefined && chunk.delta !== '') {
      nextThinking = previous + chunk.delta
    } else if (chunk.content !== undefined && chunk.content !== '') {
      if (chunk.content.startsWith(previous)) {
        nextThinking = chunk.content
      } else if (previous.startsWith(chunk.content)) {
        nextThinking = previous
      } else {
        nextThinking = previous + chunk.content
      }
    }

    this.thinkingContent = nextThinking
    this.handlers.onThinkingUpdate?.(this.thinkingContent)
  }

  /**
   * Handle an approval-requested chunk
   */
  private handleApprovalRequestedChunk(
    chunk: Extract<StreamChunk, { type: 'approval-requested' }>,
  ): void {
    this.handlers.onApprovalRequested?.(
      chunk.toolCallId,
      chunk.toolName,
      chunk.input,
      chunk.approval.id,
    )
  }

  /**
   * Handle a tool-input-available chunk
   */
  private handleToolInputAvailableChunk(
    chunk: Extract<StreamChunk, { type: 'tool-input-available' }>,
  ): void {
    this.handlers.onToolInputAvailable?.(
      chunk.toolCallId,
      chunk.toolName,
      chunk.input,
    )
  }

  /**
   * Detect if an incoming content chunk represents a NEW text segment
   * (vs a continuation of the current segment)
   *
   * This is needed to properly handle the pattern:
   * Text1 -> ToolCall -> Text2
   *
   * We need to detect when Text2 starts so we can reset the text buffer
   * and emit Text1 separately.
   *
   * A new segment is detected when the incoming content doesn't look like
   * a continuation of the existing text (different starting text).
   */
  private isNewTextSegment(
    chunk: Extract<StreamChunk, { type: 'content' }>,
    previous: string,
  ): boolean {
    // If using delta and previous is non-empty, check if this looks like fresh content
    // For deltas, we rely on the content field (if available) to detect new segments
    if (chunk.delta !== undefined && chunk.content !== undefined) {
      // If the chunk's accumulated content is shorter than our previous text,
      // it's definitely a new segment (e.g., previous="Hello world", content="Now")
      if (chunk.content.length < previous.length) {
        return true
      }

      // If the chunk's accumulated content doesn't start with our previous text,
      // and our previous text doesn't start with it, it's a new segment
      if (
        !chunk.content.startsWith(previous) &&
        !previous.startsWith(chunk.content)
      ) {
        return true
      }
    }

    // If only delta is provided (no accumulated content), we can't reliably detect
    // new segments, so assume continuation
    // If only content is provided, use the existing logic in handleContentChunk

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

    // Emit state change event
    this.handlers.onToolCallStateChange?.(
      index,
      toolCall.id,
      toolCall.name,
      'input-complete',
      toolCall.arguments,
      toolCall.parsedArguments,
    )

    // Emit complete event
    this.handlers.onToolCallComplete?.(
      index,
      toolCall.id,
      toolCall.name,
      toolCall.arguments,
    )
  }

  /**
   * Emit pending text update
   */
  private emitTextUpdate(): void {
    this.lastEmittedText = this.currentSegmentText
    this.handlers.onTextUpdate?.(this.currentSegmentText)
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

    // Emit stream end with total accumulated content
    const toolCalls = this.getCompletedToolCalls()
    this.handlers.onStreamEnd?.(
      this.totalTextContent,
      toolCalls.length > 0 ? toolCalls : undefined,
    )
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
      content: this.textContent,
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
   * Reset processor state
   */
  reset(): void {
    this.textContent = ''
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
    async *[Symbol.asyncIterator]() {
      for (const { chunk } of recording.chunks) {
        yield chunk
      }
    },
  }
}
