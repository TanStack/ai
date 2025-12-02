import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { aiEventClient } from '@tanstack/ai/event-client'
import type { StreamChunk, ToolCall } from '@tanstack/ai'

/**
 * Recording data structure matching the old format
 */
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
    toolCalls: Array<ToolCall>
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
      toolCalls: Map<string, ToolCall>
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
    delta?: string,
  ): StreamChunk => ({
    type: 'content',
    content,
    delta,
  })

  const createToolCallChunk = (
    toolCallId: string,
    toolName: string,
    index: number,
    arguments_: string,
  ): StreamChunk => ({
    type: 'tool_call',
    toolCall: {
      id: toolCallId,
      type: 'function',
      function: {
        name: toolName,
        arguments: arguments_,
      },
    },
    index,
  })

  const createToolResultChunk = (
    toolCallId: string,
    result: string,
  ): StreamChunk => ({
    type: 'tool_result',
    toolCallId,
    content: result,
  })

  const createDoneChunk = (
    finishReason: string | null,
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    },
  ): StreamChunk => ({
    type: 'done',
    finishReason: finishReason as any,
    usage,
  })

  const createErrorChunk = (error: string): StreamChunk => ({
    type: 'error',
    error: {
      message: error,
    },
  })

  const createThinkingChunk = (
    content: string,
    delta?: string,
  ): StreamChunk => ({
    type: 'thinking',
    content,
    delta,
  })

  // Subscribe to stream:started to initialize recording
  const unsubscribeStarted = aiEventClient.on(
    'stream:started',
    (event) => {
      const { streamId, model, provider } = event.payload
      // If traceId is provided, we'll track this streamId when we see chat:started
      // For now, track all streams (we'll filter later)
      activeStreams.set(streamId, {
        streamId,
        requestId: '', // Will be set from chat:started
        model,
        provider,
        chunks: [],
        accumulatedContent: '',
        toolCalls: new Map(),
        finishReason: null,
        traceId: undefined,
      })
    },
    { withEventTarget: false },
  )

  // Subscribe to chat:started to get requestId and check if we should record
  const unsubscribeChatStarted = aiEventClient.on(
    'chat:started',
    (event) => {
      const { streamId, requestId, providerOptions } = event.payload
      const stream = activeStreams.get(streamId)
      if (stream) {
        stream.requestId = requestId
        // Check if providerOptions contain traceId matching our filter
        // If traceId is provided, only record streams that match
        if (
          traceId &&
          providerOptions &&
          (providerOptions as any).traceId === traceId
        ) {
          stream.traceId = traceId
          recordingStreamId = streamId
        } else if (!traceId) {
          // If no traceId filter, record all streams
          recordingStreamId = streamId
        }
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
    'stream:chunk:content',
    (event) => {
      const { streamId, content, delta, timestamp } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        stream.accumulatedContent = content
        stream.chunks.push({
          chunk: createContentChunk(content, delta),
          timestamp,
          index: chunkIndex++,
        })
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to tool call chunks
  const unsubscribeToolCall = aiEventClient.on(
    'stream:chunk:tool-call',
    (event) => {
      const {
        streamId,
        toolCallId,
        toolName,
        index,
        arguments: args,
        timestamp,
      } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        stream.chunks.push({
          chunk: createToolCallChunk(toolCallId, toolName, index, args),
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
          } as ToolCall)
        }
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to tool result chunks
  const unsubscribeToolResult = aiEventClient.on(
    'stream:chunk:tool-result',
    (event) => {
      const { streamId, toolCallId, result, timestamp } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        stream.chunks.push({
          chunk: createToolResultChunk(toolCallId, result),
          timestamp,
          index: chunkIndex++,
        })
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to done chunks
  const unsubscribeDone = aiEventClient.on(
    'stream:chunk:done',
    (event) => {
      const { streamId, finishReason, usage, timestamp } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        stream.finishReason = finishReason || null
        stream.chunks.push({
          chunk: createDoneChunk(finishReason, usage),
          timestamp,
          index: chunkIndex++,
        })
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to error chunks
  const unsubscribeError = aiEventClient.on(
    'stream:chunk:error',
    (event) => {
      const { streamId, error, timestamp } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        stream.chunks.push({
          chunk: createErrorChunk(error),
          timestamp,
          index: chunkIndex++,
        })
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to thinking chunks
  const unsubscribeThinking = aiEventClient.on(
    'stream:chunk:thinking',
    (event) => {
      const { streamId, content, delta, timestamp } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        stream.chunks.push({
          chunk: createThinkingChunk(content, delta),
          timestamp,
          index: chunkIndex++,
        })
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to chat:completed to get final tool calls
  const unsubscribeChatCompleted = aiEventClient.on(
    'chat:completed',
    async (event) => {
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

  // Subscribe to tool:call-completed to update tool call results
  const unsubscribeToolCompleted = aiEventClient.on(
    'tool:call-completed',
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
          } as ToolCall)
        }
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to stream:ended to save recording
  const unsubscribeStreamEnded = aiEventClient.on(
    'stream:ended',
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
      unsubscribeChatStarted()
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
