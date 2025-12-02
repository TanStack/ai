import type { ConnectionAdapter } from '../src/connection-adapters'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { UIMessage } from '../src/types'
/**
 * Options for creating a mock connection adapter
 */
interface MockConnectionAdapterOptions {
  /**
   * Chunks to yield from the stream
   */
  chunks?: Array<StreamChunk>

  /**
   * Delay between chunks (in ms)
   */
  chunkDelay?: number

  /**
   * Whether to throw an error
   */
  shouldError?: boolean

  /**
   * Error to throw
   */
  error?: Error

  /**
   * Callback when connect is called
   */
  onConnect?: (
    messages: Array<ModelMessage> | Array<UIMessage>,
    data?: Record<string, any>,
    abortSignal?: AbortSignal,
  ) => void

  /**
   * Callback to check abort signal during streaming
   */
  onAbort?: (abortSignal: AbortSignal) => void
}

/**
 * Create a mock connection adapter for testing
 *
 * @example
 * ```typescript
 * const adapter = createMockConnectionAdapter({
 *   chunks: [
 *     { type: "content", id: "1", model: "test", timestamp: Date.now(), delta: "Hello", content: "Hello", role: "assistant" },
 *     { type: "done", id: "1", model: "test", timestamp: Date.now(), finishReason: "stop" }
 *   ]
 * });
 * ```
 */
export function createMockConnectionAdapter(
  options: MockConnectionAdapterOptions = {},
): ConnectionAdapter {
  const {
    chunks = [],
    chunkDelay = 0,
    shouldError = false,
    error = new Error('Mock adapter error'),
    onConnect,
    onAbort,
  } = options

  return {
    async *connect(messages, data, abortSignal) {
      if (onConnect) {
        // Type assertion: messages can be ModelMessage[] or UIMessage[]
        // Filter out system messages if present
        const filteredMessages = (messages as any[]).filter(
          (m: any) => !('role' in m) || m.role !== 'system',
        )
        onConnect(filteredMessages as any, data, abortSignal)
      }

      if (shouldError) {
        throw error
      }

      for (const chunk of chunks) {
        // Check abort signal before yielding
        if (abortSignal?.aborted) {
          if (onAbort) {
            onAbort(abortSignal)
          }
          return
        }

        if (chunkDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, chunkDelay))
        }

        // Check again after delay
        if (abortSignal?.aborted) {
          if (onAbort) {
            onAbort(abortSignal)
          }
          return
        }

        yield chunk
      }
    },
  }
}

/**
 * Helper to create simple text content chunks
 */
export function createTextChunks(
  text: string,
  messageId: string = 'msg-1',
  model: string = 'test',
): Array<StreamChunk> {
  const chunks: Array<StreamChunk> = []
  let accumulated = ''

  for (const chunk of text) {
    accumulated += chunk
    chunks.push({
      type: 'content',
      id: messageId,
      model,
      timestamp: Date.now(),
      delta: chunk,
      content: accumulated,
      role: 'assistant',
    } as StreamChunk)
  }

  chunks.push({
    type: 'done',
    id: messageId,
    model,
    timestamp: Date.now(),
    finishReason: 'stop',
  } as StreamChunk)

  return chunks
}

/**
 * Helper to create tool call chunks (in adapter format)
 * Optionally includes tool-input-available chunks to trigger onToolInputAvailable
 */
export function createToolCallChunks(
  toolCalls: Array<{ id: string; name: string; arguments: string }>,
  messageId: string = 'msg-1',
  model: string = 'test',
  includeToolInputAvailable: boolean = true,
): Array<StreamChunk> {
  const chunks: Array<StreamChunk> = []

  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i]
    chunks.push({
      type: 'tool_call',
      id: messageId,
      model,
      timestamp: Date.now(),
      index: i,
      toolCall: {
        id: toolCall?.id,
        type: 'function',
        function: {
          name: toolCall?.name,
          arguments: toolCall?.arguments,
        },
      },
    } as StreamChunk)

    // Add tool-input-available chunk if requested
    if (includeToolInputAvailable) {
      let parsedInput: any
      try {
        parsedInput = JSON.parse(toolCall?.arguments ?? '')
      } catch {
        parsedInput = toolCall?.arguments
      }

      chunks.push({
        type: 'tool-input-available',
        id: messageId,
        model,
        timestamp: Date.now(),
        toolCallId: toolCall?.id,
        toolName: toolCall?.name,
        input: parsedInput,
      } as StreamChunk)
    }
  }

  chunks.push({
    type: 'done',
    id: messageId,
    model,
    timestamp: Date.now(),
    finishReason: 'stop',
  } as StreamChunk)

  return chunks
}
