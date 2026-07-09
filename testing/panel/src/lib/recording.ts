import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { EventType } from '@tanstack/ai'
import { aiEventClient as baseAiEventClient } from '@tanstack/ai-event-client'
import type { AIDevtoolsEventMap } from '@tanstack/ai-event-client'
import type { StreamChunk, TokenUsage } from '@tanstack/ai'

/**
 * Recording data structure matching the trace format produced by
 * `wrapAdapterForRecording` in `routes/api.chat.ts` and consumed by the stream
 * debugger. Each `chunk` is a `StreamChunk` (an AG-UI protocol event).
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

// ---------------------------------------------------------------------------
// AG-UI event constructors.
//
// The devtools event stream is already decomposed into per-kind chunks
// (`text:chunk:content`, `text:chunk:tool-call`, ...). We reconstruct the
// equivalent AG-UI `StreamChunk`s — including the START/END boundary events the
// StreamProcessor needs to open and close messages and tool calls — so the
// recorded trace replays the same way an adapter-recorded one (from
// `wrapAdapterForRecording`) does.
// ---------------------------------------------------------------------------

const textMessageStart = (
  messageId: string,
  model: string,
  timestamp: number,
): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_START,
  messageId,
  role: 'assistant',
  model,
  timestamp,
})

const textMessageContent = (
  messageId: string,
  content: string,
  delta: string | undefined,
  model: string,
  timestamp: number,
): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId,
  delta: delta ?? '',
  content,
  model,
  timestamp,
})

const textMessageEnd = (
  messageId: string,
  model: string,
  timestamp: number,
): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_END,
  messageId,
  model,
  timestamp,
})

const toolCallStart = (
  toolCallId: string,
  toolName: string,
  index: number,
  model: string,
  timestamp: number,
): StreamChunk => ({
  type: EventType.TOOL_CALL_START,
  toolCallId,
  toolCallName: toolName,
  toolName,
  index,
  model,
  timestamp,
})

const toolCallArgs = (
  toolCallId: string,
  delta: string,
  args: string,
  model: string,
  timestamp: number,
): StreamChunk => ({
  type: EventType.TOOL_CALL_ARGS,
  toolCallId,
  delta,
  args,
  model,
  timestamp,
})

const toolCallResult = (
  messageId: string,
  toolCallId: string,
  content: string,
  model: string,
  timestamp: number,
): StreamChunk => ({
  type: EventType.TOOL_CALL_RESULT,
  messageId,
  toolCallId,
  content,
  role: 'tool',
  model,
  timestamp,
})

const runFinished = (
  runId: string,
  threadId: string,
  finishReason: string | null,
  usage: TokenUsage | undefined,
  model: string,
  timestamp: number,
): StreamChunk => ({
  type: EventType.RUN_FINISHED,
  runId,
  threadId,
  finishReason: normalizeFinishReason(finishReason),
  usage,
  model,
  timestamp,
})

const runError = (
  runId: string,
  threadId: string,
  message: string,
  model: string,
  timestamp: number,
): StreamChunk => ({
  type: EventType.RUN_ERROR,
  runId,
  threadId,
  message,
  model,
  timestamp,
})

const reasoningContent = (
  messageId: string,
  delta: string | undefined,
  model: string,
  timestamp: number,
): StreamChunk => ({
  type: EventType.REASONING_MESSAGE_CONTENT,
  messageId,
  delta: delta ?? '',
  model,
  timestamp,
})

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
  type RecordedChunk = { chunk: StreamChunk; timestamp: number; index: number }

  // Per-stream recording state, including the AG-UI message/tool ids and the
  // boundary flags used to emit START/END events exactly once.
  interface StreamState {
    streamId: string
    requestId: string
    model: string
    provider: string
    runId: string
    threadId: string
    messageId: string
    reasoningId: string
    messageStarted: boolean
    startedToolCalls: Set<string>
    chunks: Array<RecordedChunk>
    accumulatedContent: string
    toolCalls: Map<string, RecordedToolCall>
    finishReason: string | null
  }

  const activeStreams = new Map<string, StreamState>()

  // Track which streamId belongs to this recording (if traceId is provided)
  let recordingStreamId: string | undefined

  let chunkIndex = 0

  const pushChunk = (
    stream: StreamState,
    chunk: StreamChunk,
    timestamp: number,
  ): void => {
    stream.chunks.push({ chunk, timestamp, index: chunkIndex++ })
  }

  // Ensures a TEXT_MESSAGE_START has been emitted before any content/end.
  const ensureMessageStarted = (
    stream: StreamState,
    timestamp: number,
  ): void => {
    if (stream.messageStarted) return
    stream.messageStarted = true
    pushChunk(
      stream,
      textMessageStart(stream.messageId, stream.model, timestamp),
      timestamp,
    )
  }

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
        runId: requestId || `run-${streamId}`,
        threadId: `thread-${streamId}`,
        messageId: `msg-${streamId}`,
        reasoningId: `reasoning-${streamId}`,
        messageStarted: false,
        startedToolCalls: new Set<string>(),
        chunks: [],
        accumulatedContent: '',
        toolCalls: new Map<string, RecordedToolCall>(),
        finishReason: null,
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
        const resolvedModel = model ?? stream.model
        ensureMessageStarted(stream, timestamp)
        pushChunk(
          stream,
          textMessageContent(
            stream.messageId,
            content,
            delta,
            resolvedModel,
            timestamp,
          ),
          timestamp,
        )
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
        const resolvedModel = model ?? stream.model
        // Emit a TOOL_CALL_START the first time we see this tool call.
        if (!stream.startedToolCalls.has(toolCallId)) {
          stream.startedToolCalls.add(toolCallId)
          pushChunk(
            stream,
            toolCallStart(
              toolCallId,
              toolName,
              index,
              resolvedModel,
              timestamp,
            ),
            timestamp,
          )
        }
        pushChunk(
          stream,
          toolCallArgs(toolCallId, args, args, resolvedModel, timestamp),
          timestamp,
        )
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
        const resolvedModel = model ?? stream.model
        pushChunk(
          stream,
          toolCallResult(
            stream.messageId,
            toolCallId,
            result,
            resolvedModel,
            timestamp,
          ),
          timestamp,
        )
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
        const resolvedModel = model ?? stream.model
        // Close the open text message (if any) before finishing the run.
        if (stream.messageStarted) {
          pushChunk(
            stream,
            textMessageEnd(stream.messageId, resolvedModel, timestamp),
            timestamp,
          )
          stream.messageStarted = false
        }
        pushChunk(
          stream,
          runFinished(
            stream.runId,
            stream.threadId,
            finishReason,
            usage,
            resolvedModel,
            timestamp,
          ),
          timestamp,
        )
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
        const resolvedModel = model ?? stream.model
        pushChunk(
          stream,
          runError(
            stream.runId,
            stream.threadId,
            error,
            resolvedModel,
            timestamp,
          ),
          timestamp,
        )
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to thinking chunks
  const unsubscribeThinking = aiEventClient.on(
    'text:chunk:thinking',
    (event) => {
      const { streamId, delta, timestamp, model } = event.payload
      if (!shouldRecord(streamId)) return
      const stream = activeStreams.get(streamId)
      if (stream) {
        const resolvedModel = model ?? stream.model
        pushChunk(
          stream,
          reasoningContent(stream.reasoningId, delta, resolvedModel, timestamp),
          timestamp,
        )
      }
    },
    { withEventTarget: false },
  )

  // Subscribe to text:request:completed to get final content + finish reason
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
