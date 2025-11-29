import type { AnyClientTool, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { ConnectionAdapter } from './connection-adapters'
import type { ChunkStrategy, StreamParser } from './stream/types'
import type { ExtractToolOutput } from './tool-types'

/**
 * Tool call states - track the lifecycle of a tool call
 */
export type ToolCallState =
  | 'awaiting-input' // Received start but no arguments yet
  | 'input-streaming' // Partial arguments received
  | 'input-complete' // All arguments received
  | 'approval-requested' // Waiting for user approval
  | 'approval-responded' // User has approved/denied

/**
 * Tool result states - track the lifecycle of a tool result
 */
export type ToolResultState =
  | 'streaming' // Placeholder for future streamed output
  | 'complete' // Result is complete
  | 'error' // Error occurred

/**
 * Message parts - building blocks of UIMessage
 */
export interface TextPart {
  type: 'text'
  content: string
}

export type ToolCallPart<TTools extends ReadonlyArray<AnyClientTool> = any> =
  TTools extends ReadonlyArray<AnyClientTool>
    ? {
        [K in keyof TTools]: TTools[K] extends AnyClientTool
          ? {
              type: 'tool-call'
              id: string
              name: TTools[K]['name']
              arguments: string // JSON string (may be incomplete)
              state: ToolCallState
              /** Approval metadata if tool requires user approval */
              approval?: {
                id: string // Unique approval ID
                needsApproval: boolean // Always true if present
                approved?: boolean // User's decision (undefined until responded)
              }
              /** Tool execution output (for client tools or after approval) */
              output?: ExtractToolOutput<TTools, TTools[K]['name']>
            }
          : never
      }[number]
    : {
        type: 'tool-call'
        id: string
        name: string
        arguments: string
        state: ToolCallState
        approval?: {
          id: string
          needsApproval: boolean
          approved?: boolean
        }
        output?: any
      }

export interface ToolResultPart {
  type: 'tool-result'
  toolCallId: string
  content: string
  state: ToolResultState
  error?: string // Error message if state is "error"
}

export interface ThinkingPart {
  type: 'thinking'
  content: string
}

export type MessagePart<TTools extends ReadonlyArray<AnyClientTool> = any> =
  | TextPart
  | ToolCallPart<TTools>
  | ToolResultPart
  | ThinkingPart

/**
 * UIMessage - Domain-specific message format optimized for building chat UIs
 * Contains parts that can be text, tool calls, or tool results
 */
export interface UIMessage<TTools extends ReadonlyArray<AnyClientTool> = any> {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: Array<MessagePart<TTools>>
  createdAt?: Date
}

export interface ChatClientOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> {
  /**
   * Connection adapter for streaming
   * Use fetchServerSentEvents(), fetchHttpStream(), or stream() to create adapters
   */
  connection: ConnectionAdapter

  /**
   * Initial messages to populate the chat
   */
  initialMessages?: Array<UIMessage<TTools>>

  /**
   * Unique identifier for this chat instance
   * Used for managing multiple chats
   */
  id?: string

  /**
   * Additional body parameters to send
   */
  body?: Record<string, any>

  /**
   * Callback when a response is received
   */
  onResponse?: (response?: Response) => void | Promise<void>

  /**
   * Callback when a stream chunk is received
   */
  onChunk?: (chunk: StreamChunk) => void

  /**
   * Callback when the response is finished
   */
  onFinish?: (message: UIMessage<TTools>) => void

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void

  /**
   * Callback when messages change
   */
  onMessagesChange?: (messages: Array<UIMessage<TTools>>) => void

  /**
   * Callback when loading state changes
   */
  onLoadingChange?: (isLoading: boolean) => void

  /**
   * Callback when error state changes
   */
  onErrorChange?: (error: Error | undefined) => void

  /**
   * Client-side tools with execution logic
   * When provided, tools with execute functions will be called automatically
   */
  tools?: TTools

  /**
   * Stream processing options (optional)
   * Configure chunking strategy and custom parsers
   */
  streamProcessor?: {
    /**
     * Strategy for when to emit text updates
     * Defaults to ImmediateStrategy (every chunk)
     */
    chunkStrategy?: ChunkStrategy

    /**
     * Custom stream parser
     * Override to handle different stream formats
     */
    parser?: StreamParser
  }
}

export interface ChatRequestBody {
  messages: Array<ModelMessage>
  data?: Record<string, any>
}

/**
 * Helper to create typed chat client options
 * Use this to get proper type inference for messages
 *
 * @example
 * ```ts
 * const chatOptions = createChatClientOptions({
 *   connection: fetchServerSentEvents('/api/chat'),
 *   tools: [myTool1, myTool2],
 * })
 *
 * type MyMessages = InferChatMessages<typeof chatOptions>
 * ```
 */
export function createChatClientOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
>(options: ChatClientOptions<TTools>): ChatClientOptions<TTools> {
  return options
}

/**
 * Extract the message type from chat options
 *
 * @example
 * ```ts
 * const chatOptions = createChatClientOptions({
 *   connection: fetchServerSentEvents('/api/chat'),
 *   tools: [myTool1, myTool2],
 * })
 *
 * type MyMessages = InferChatMessages<typeof chatOptions>
 * // MyMessages is now Array<UIMessage<[typeof myTool1, typeof myTool2]>>
 * ```
 */
export type InferChatMessages<T> =
  T extends ChatClientOptions<infer TTools> ? Array<UIMessage<TTools>> : never
