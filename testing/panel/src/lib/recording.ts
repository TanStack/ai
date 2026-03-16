import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { aiEventClient as baseAiEventClient } from '@tanstack/ai-event-client'
import type { AIDevtoolsEventMap } from '@tanstack/ai-event-client'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Recording data structure matching the old format
 */
export interface RecordedToolCall {
  id: string
  name: string
  arguments: string
  result?: unknown
}

export interface ChunkRecording {
  version: '1.0'
  timestamp: number
  model: string
  provider: string
  chunks: Array<{
    chunk: StreamChunk
    timestamp: number
    index: number
  }>
  result?: {
    content: string
    toolCalls: Array<RecordedToolCall>
    finishReason: string | null
  }
}

/**
 * Creates an event-based recording that subscribes to aiEventClient events
 * and saves recordings to a file when a stream completes.
 *
 * @param filePath - Path where the recording will be saved
 * @param traceId - Optional trace ID to filter events (if not provided, records all streams)
 * @returns Object with stop() method to unsubscribe from events
 *
 * @example
 * const recording = createEventRecording('tmp/recording.json', 'trace_123')
 * // Recording automatically starts listening to events for this traceId
 * // Call recording.stop() when done to unsubscribe
 */
export function createEventRecording(
  filePath: string,
  traceId?: string,
): {
  stop: () => void
  getStreamId: () => string | undefined
} {
  // Track active streams and their data
  const activeStreams = new Map<
    string,
    {
      streamId: string
      requestId: string
      model: string
      provider: string
      chunks: Array<{
        chunk: StreamChunk
        timestamp: number
        index: number
      }>
      accumulatedContent: string
      toolCalls: Map<string, RecordedToolCall>
      finishReason: string | null
      traceId?: string
    }
  >()

  // Track which streamId belongs to this recording (if traceId is provided)
  let recordingStreamId: string | undefined

  let chunkIndex = 0

  // Helper to reconstruct StreamChunk from events
  const createContentChunk = (
    content: string,
    delta: string | undefined,
    model: string,
    timestamp: number,
    messageId: string,
  ): StreamChunk => ({
    type: 'TEXT_MESSAGE_CONTENT',
    messageId,
    content,
    delta: delta ?? '',
    model,
    timestamp,
  })

  const createToolCallChunk = (
    toolCallId: string,
    toolName: string,
    index: number,
    arguments_: string,
    model: string,
    timestamp: number,
    messageId: string,
  ): StreamChunk => {
    if (arguments_.length === 0) {
      return {
        type: 'TOOL_CALL_START',
        toolCallId,
        toolName,
        parentMessageId: messageId,
        index,
        model,
        timestamp,
      }
    }

    return {
      type: 'TOOL_CALL_ARGS',
      toolCallId,
      delta: arguments_,
      args: arguments_,
      model,
      timestamp,
    }
  }

  const createToolResultChunk = (
    toolCallId: string,
    toolName: string,
    result: string,
    model: string,
    timestamp: number,
    runId: string,
  ): StreamChunk => ({
    type: 'TOOL_CALL_END',
    toolCallId,
    toolName,
    result,
    model,
    timestamp,
    rawEvent: { runId },
  })

  type FinishReason = 'stop' | 'length' | 'content_filter' | 'tool_calls' | null

  const normalizeFinishReason = (finishReason: string | null): FinishReason => {
    if (
      finishReason === 'stop' ||
      finishReason === 'length' ||
      finishReason === 'content_filter' ||
      finishReason === 'tool_calls'
    ) {
      return finishReason
    }
    return 'stop'
  }

  const createDoneChunk = (
    runId: string,
    finishReason: string | null,
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    },
    model?: string,
    timestamp?: number,
  ): StreamChunk => ({
    type: 'RUN_FINISHED',
    runId,
    finishReason: normalizeFinishReason(finishReason),
    usage,
    model: model ?? 'unknown',
    timestamp: timestamp ?? Date.now(),
  })

  const createErrorChunk = (
    runId: string,
    error: string,
    model: string,
    timestamp: number,
  ): StreamChunk => ({
    type: 'RUN_ERROR',
    runId,
    error: {
      message: error,
    },
    model,
    timestamp,
  })

  const createThinkingChunk = (
    streamId: string,
    content: string,
    delta: string | undefined,
    model: string,
    timestamp: number,
  ): StreamChunk => ({
    type: 'STEP_FINISHED',
    stepId: `step-${streamId}`,
    content,
    delta: delta ?? '',
    model,
    timestamp,
  })

  type DevtoolsEventHandler<TEventName extends keyof AIDevtoolsEventMap> =
    (event: { payload: AIDevtoolsEventMap[TEventName] }) => void

  type DevtoolsEventClient = {
    on: <TEventName extends keyof AIDevtoolsEventMap>(
      eventName: TEventName,
      handler: DevtoolsEventHandler<TEventName>,
      options?: { withEventTarget?: boolean },
    ) => () => void
  }

  const aiEventClient = baseAiEventClient as DevtoolsEventClient

  // Subscribe to text:request:started to initialize recording
  const unsubscribeStarted = aiEventClient.on(
    'text:request:started',
    (event) => {
      const { streamId, model, provider, requestId, options, modelOptions } =
        event.payload

      activeStreams.set(streamId, {
        streamId,
        requestId,
        model,
        provider,
        chunks: [],
        accumulatedContent: '',
        toolCalls: new Map<string, RecordedToolCall>(),
        finishReason: null,
        traceId: undefined,
      })

      const optionsTraceId = options?.traceId
      const modelOptionsTraceId = modelOptions?.traceId

      const eventTraceId = optionsTraceId || modelOptionsTraceId

      if (traceId && eventTraceId === traceId) {
        recordingStreamId = streamId
      } else if (!traceId) {
        recordingStreamId = streamId
      }
    },
    { withEventTarget: false },
  )

  // Helper to check if we should record this stream
  const shouldRecord = (streamId: string): boolean => {
    if (!traceId) return true // Record all if no filter
    return streamId === recordingStreamId
  }

  // Subscribe to content chunks
  const unsubscribeContent = aiEventClient.on(
    'text:chunk:content',
    (event) => {
      const { streamId, content, delta, timestamp, model } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        stream.accumulatedContent = content
        const resolvedModel = model ?? 'unknown'
        const messageId = event.payload.messageId ?? `msg-${streamId}`
        stream.chunks.push({
          chunk: createContentChunk(
            content,
            delta,
            resolvedModel,
            timestamp,
            messageId,
          ),
          timestamp,
          index: chunkIndex++,
        })
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to tool call chunks
  const unsubscribeToolCall = aiEventClient.on(
    'text:chunk:tool-call',
    (event) => {
      const {
        streamId,
        toolCallId,
        toolName,
        index,
        arguments: args,
        timestamp,
        model,
      } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        const resolvedModel = model ?? 'unknown'
        const messageId = event.payload.messageId ?? `msg-${streamId}`
        stream.chunks.push({
          chunk: createToolCallChunk(
            toolCallId,
            toolName,
            index,
            args,
            resolvedModel,
            timestamp,
            messageId,
          ),
          timestamp,
          index: chunkIndex++,
        })
        // Store tool call info for final recording (update arguments as they stream)
        const existing = stream.toolCalls.get(toolCallId)
        if (existing) {
          existing.arguments = args
        } else {
          stream.toolCalls.set(toolCallId, {
            id: toolCallId,
            name: toolName,
            arguments: args,
            result: undefined,
          })
        }
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to tool result chunks
  const unsubscribeToolResult = aiEventClient.on(
    'text:chunk:tool-result',
    (event) => {
      const { streamId, toolCallId, result, timestamp, model } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        const resolvedModel = model ?? 'unknown'
        const toolName = stream.toolCalls.get(toolCallId)?.name ?? 'unknown-tool'
        stream.chunks.push({
          chunk: createToolResultChunk(
            toolCallId,
            toolName,
            result,
            resolvedModel,
            timestamp,
            `run-${streamId}`,
          ),
          timestamp,
          index: chunkIndex++,
        })
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to done chunks
  const unsubscribeDone = aiEventClient.on(
    'text:chunk:done',
    (event) => {
      const { streamId, finishReason, usage, timestamp, model } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        stream.finishReason = finishReason || null
        const resolvedModel = model ?? 'unknown'
        stream.chunks.push({
          chunk: createDoneChunk(
            `run-${streamId}`,
            finishReason,
            usage,
            resolvedModel,
            timestamp,
          ),
          timestamp,
          index: chunkIndex++,
        })
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to error chunks
  const unsubscribeError = aiEventClient.on(
    'text:chunk:error',
    (event) => {
      const { streamId, error, timestamp, model } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        const resolvedModel = model ?? 'unknown'
        stream.chunks.push({
          chunk: createErrorChunk(
            `run-${streamId}`,
            error,
            resolvedModel,
            timestamp,
          ),
          timestamp,
          index: chunkIndex++,
        })
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to thinking chunks
  const unsubscribeThinking = aiEventClient.on(
    'text:chunk:thinking',
    (event) => {
      const { streamId, content, delta, timestamp, model } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        const resolvedModel = model ?? 'unknown'
        stream.chunks.push({
          chunk: createThinkingChunk(
            streamId,
            content,
            delta,
            resolvedModel,
            timestamp,
          ),
          timestamp,
          index: chunkIndex++,
        })
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to text:request:completed to get final tool calls
  const unsubscribeChatCompleted = aiEventClient.on(
    'text:request:completed',
    (event) => {
      const { streamId, content, finishReason } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        stream.accumulatedContent = content
        stream.finishReason = finishReason || null
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to tools:call:completed to update tool call results
  const unsubscribeToolCompleted = aiEventClient.on(
    'tools:call:completed',
    (event) => {
      const { streamId, toolCallId, toolName, result } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        // Update tool call result (arguments should already be set from tool-call chunks)
        const existing = stream.toolCalls.get(toolCallId)
        if (existing) {
          existing.result = result
        } else {
          // Fallback if we missed the tool-call chunk
          stream.toolCalls.set(toolCallId, {
            id: toolCallId,
            name: toolName,
            arguments: '',
            result,
          })
        }
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to text:request:completed to save recording
  const unsubscribeStreamEnded = aiEventClient.on(
    'text:request:completed',
    async (event) => {
      const { streamId } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (!stream) {
        return
      }

      try {
        // Ensure directory exists
        const dir = path.dirname(filePath)
        await fs.mkdir(dir, { recursive: true })

        // Build recording object
        const recording: ChunkRecording = {
          version: '1.0',
          timestamp: Date.now(),
          model: stream.model,
          provider: stream.provider,
          chunks: stream.chunks,
          result: {
            content: stream.accumulatedContent,
            toolCalls: Array.from(stream.toolCalls.values()),
            finishReason: stream.finishReason,
          },
        }

        // Write recording
        await fs.writeFile(
          filePath,
          JSON.stringify(recording, null, 2),
          'utf-8',
        )

        console.log(`Recording saved to: ${filePath}`)

        // Clean up
        activeStreams.delete(streamId)
      } catch (error) {
        console.error('Failed to save recording:', error)
      }
    },
    { withEventTarget: false },
  )

  // Return cleanup function
  return {
    stop: () => {
      unsubscribeStarted()
      unsubscribeContent()
      unsubscribeToolCall()
      unsubscribeToolResult()
      unsubscribeDone()
      unsubscribeError()
      unsubscribeThinking()
      unsubscribeChatCompleted()
      unsubscribeToolCompleted()
      unsubscribeStreamEnded()
      activeStreams.clear()
    },
    getStreamId: () => recordingStreamId,
  }
}
