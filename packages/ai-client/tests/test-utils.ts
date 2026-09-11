import { vi } from 'vitest'
import { withTanstackMetadata } from '@tanstack/ai/client'
import type {
  ConnectConnectionAdapter,
  SubscribeConnectionAdapter,
} from '../src/connection-adapters'
import type { ModelMessage, StreamChunk } from '@tanstack/ai/client'
import type { ChatClientPersistence, UIMessage } from '../src/types'

function runFinishedChunk(options: {
  runId: string
  threadId: string
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  model?: string
}): StreamChunk {
  return withTanstackMetadata(
    {
      type: 'RUN_FINISHED',
      runId: options.runId,
      threadId: options.threadId,
      timestamp: Date.now(),
    },
    {
      finishReason: options.finishReason,
      ...(options.model !== undefined ? { model: options.model } : {}),
    },
  ) as StreamChunk
}

/**
 * Build a minimal text {@link UIMessage} for tests.
 */
export function createUIMessage(
  id: string,
  text: string = 'hello',
  role: UIMessage['role'] = 'user',
): UIMessage {
  return { id, role, parts: [{ type: 'text', content: text }] }
}

/** Mock message persistence adapter for ChatPersistor / ChatClient tests. */
export function createMockPersistence(
  initial?: Array<UIMessage> | null,
): ChatClientPersistence {
  return {
    getItem: vi.fn(() => initial),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
}

/**
 * Options for creating a mock connection adapter
 */
export interface MockConnectionAdapterOptions {
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
 *     { type: "TEXT_MESSAGE_CONTENT", messageId: "1", timestamp: Date.now(), delta: "Hello" },
 *     { type: "RUN_FINISHED", runId: "run-1", timestamp: Date.now(), metadata: { tanstack: { finishReason: "stop" } } }
 *   ]
 * });
 * ```
 */
export function createMockConnectionAdapter(
  options: MockConnectionAdapterOptions = {},
): ConnectConnectionAdapter {
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
 * Subscribe/send adapter that tests can push chunks into at any time.
 *
 * A push between reading the queue and parking the waiter would lose the wake
 * on a naive mock. This helper:
 * - rechecks the queue after every yielded batch
 * - rechecks again after parking the waiter, so a push in that window still
 *   wakes
 */
export function createPushableSubscribeConnection(): {
  connection: SubscribeConnectionAdapter
  push: (...chunks: Array<StreamChunk>) => void
} {
  let wake: (() => void) | null = null
  const queue: Array<StreamChunk> = []

  const wakeWaiter = () => {
    const resolve = wake
    wake = null
    resolve?.()
  }

  const connection: SubscribeConnectionAdapter = {
    subscribe: (signal?: AbortSignal) => {
      return (async function* () {
        while (!signal?.aborted) {
          if (queue.length > 0) {
            const batch = queue.splice(0)
            for (const chunk of batch) {
              yield chunk
            }
            continue
          }
          await new Promise<void>((resolve) => {
            if (signal?.aborted) {
              resolve()
              return
            }
            wake = resolve
            const onAbort = () => {
              if (wake === resolve) {
                wake = null
              }
              resolve()
            }
            signal?.addEventListener('abort', onAbort, { once: true })
            if (queue.length > 0 || signal?.aborted) {
              wakeWaiter()
            }
          })
        }
      })()
    },
    send: async () => {
      wakeWaiter()
    },
  }

  const push = (...chunks: Array<StreamChunk>) => {
    queue.push(...chunks)
    wakeWaiter()
  }

  return { connection, push }
}

/**
 * Helper to create simple text content chunks (AG-UI format)
 */
export function createTextChunks(
  text: string,
  messageId: string = 'msg-1',
  model: string = 'test',
): Array<StreamChunk> {
  const chunks: Array<StreamChunk> = []
  const runId = `run-${messageId}`
  const threadId = `thread-${messageId}`

  for (const delta of text) {
    chunks.push({
      type: 'TEXT_MESSAGE_CONTENT',
      messageId,
      timestamp: Date.now(),
      delta,
    } as StreamChunk)
  }

  chunks.push(
    runFinishedChunk({ runId, threadId, finishReason: 'stop', model }),
  )

  return chunks
}

/**
 * Helper to create custom event chunks
 */
export function createCustomEventChunks(
  events: Array<{ name: string; value?: unknown }>,
  model: string = 'test',
): Array<StreamChunk> {
  const chunks: Array<StreamChunk> = []

  for (const event of events) {
    chunks.push({
      type: 'CUSTOM',
      timestamp: Date.now(),
      name: event.name,
      value: event.value,
    } as StreamChunk)
  }

  chunks.push(
    runFinishedChunk({
      runId: 'run-1',
      threadId: 'thread-1',
      finishReason: 'stop',
      model,
    }),
  )

  return chunks
}

/**
 * Helper to create tool call chunks (AG-UI format)
 * Optionally includes tool-input-available chunks to trigger onToolCall
 */
export function createToolCallChunks(
  toolCalls: Array<{ id: string; name: string; arguments: string }>,
  messageId: string = 'msg-1',
  model: string = 'test',
  includeToolInputAvailable: boolean = true,
): Array<StreamChunk> {
  const chunks: Array<StreamChunk> = []
  const runId = `run-${messageId}`

  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i]!

    chunks.push({
      type: 'TOOL_CALL_START',
      toolCallId: toolCall.id,
      toolCallName: toolCall.name,
      timestamp: Date.now(),
    } as StreamChunk)

    chunks.push({
      type: 'TOOL_CALL_ARGS',
      toolCallId: toolCall.id,
      timestamp: Date.now(),
      delta: toolCall.arguments,
    } as StreamChunk)

    // Add tool-input-available CUSTOM chunk if requested
    if (includeToolInputAvailable) {
      let parsedInput: any
      try {
        parsedInput = JSON.parse(toolCall.arguments)
      } catch {
        parsedInput = toolCall.arguments
      }

      chunks.push({
        type: 'CUSTOM',
        timestamp: Date.now(),
        name: 'tool-input-available',
        value: {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          input: parsedInput,
        },
      } as StreamChunk)
    }
  }

  chunks.push(
    runFinishedChunk({
      runId,
      threadId: `thread-${messageId}`,
      finishReason: 'tool_calls',
      model,
    }),
  )

  return chunks
}

/**
 * Helper to create tool call chunks with approval requests (AG-UI format)
 * Tools will be in 'input-complete' state with pending approval
 */
export function createApprovalToolCallChunks(
  toolCalls: Array<{
    id: string
    name: string
    arguments: string
    approvalId: string
  }>,
  messageId: string = 'msg-1',
  model: string = 'test',
): Array<StreamChunk> {
  const chunks: Array<StreamChunk> = []
  const runId = `run-${messageId}`

  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i]!

    chunks.push({
      type: 'TOOL_CALL_START',
      toolCallId: toolCall.id,
      toolCallName: toolCall.name,
      timestamp: Date.now(),
    } as StreamChunk)

    chunks.push({
      type: 'TOOL_CALL_ARGS',
      toolCallId: toolCall.id,
      timestamp: Date.now(),
      delta: toolCall.arguments,
    } as StreamChunk)

    chunks.push({
      type: 'TOOL_CALL_END',
      toolCallId: toolCall.id,
      timestamp: Date.now(),
    } as StreamChunk)

    chunks.push({
      type: 'CUSTOM',
      timestamp: Date.now(),
      name: 'approval-requested',
      value: {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        input: JSON.parse(toolCall.arguments),
        approval: { id: toolCall.approvalId, needsApproval: true },
      },
    } as StreamChunk)
  }

  chunks.push(
    runFinishedChunk({
      runId,
      threadId: `thread-${messageId}`,
      finishReason: 'tool_calls',
      model,
    }),
  )

  return chunks
}

/**
 * Helper to create thinking chunks (AG-UI reasoning events)
 */
export function createThinkingChunks(
  thinkingContent: string,
  textContent: string = '',
  messageId: string = 'msg-1',
  model: string = 'test',
): Array<StreamChunk> {
  const chunks: Array<StreamChunk> = []
  const runId = `run-${messageId}`
  const reasoningId = `reasoning-${messageId}`

  for (const delta of thinkingContent) {
    chunks.push({
      type: 'REASONING_MESSAGE_CONTENT',
      messageId: reasoningId,
      timestamp: Date.now(),
      delta,
    } as StreamChunk)
  }

  if (textContent) {
    for (const delta of textContent) {
      chunks.push({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId,
        timestamp: Date.now(),
        delta,
      } as StreamChunk)
    }
  }

  chunks.push(
    runFinishedChunk({
      runId,
      threadId: `thread-${messageId}`,
      finishReason: 'stop',
      model,
    }),
  )

  return chunks
}
