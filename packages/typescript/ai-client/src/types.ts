// Re-export UIMessage types from @tanstack/ai
export type {
  TextPart,
  ToolCallPart,
  ToolResultPart,
  ThinkingPart,
  MessagePart,
  UIMessage,
} from '@tanstack/ai'

import type {
  ModelMessage,
  StreamChunk,
  ChunkStrategy,
  UIMessage,
} from '@tanstack/ai'
import type { ConnectionAdapter } from './connection-adapters'

/**
 * Options for ChatClient
 */
export interface ChatClientOptions {
  /**
   * Connection adapter for streaming
   * Use fetchServerSentEvents(), fetchHttpStream(), or stream() to create adapters
   */
  connection: ConnectionAdapter

  /**
   * Initial messages to populate the chat
   */
  initialMessages?: Array<UIMessage>

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
  onFinish?: (message: UIMessage) => void

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void

  /**
   * Callback when messages change
   */
  onMessagesChange?: (messages: Array<UIMessage>) => void

  /**
   * Callback when loading state changes
   */
  onLoadingChange?: (isLoading: boolean) => void

  /**
   * Callback when error state changes
   */
  onErrorChange?: (error: Error | undefined) => void

  /**
   * Callback when a client-side tool needs to be executed
   * Tool has no execute function - client must provide the result
   */
  onToolCall?: (args: {
    toolCallId: string
    toolName: string
    input: any
  }) => Promise<any>

  /**
   * Stream processing options (optional)
   * Configure chunking strategy
   */
  streamProcessor?: {
    /**
     * Strategy for when to emit text updates
     * Defaults to ImmediateStrategy (every chunk)
     */
    chunkStrategy?: ChunkStrategy
  }
}

export interface ChatRequestBody {
  messages: Array<ModelMessage>
  data?: Record<string, any>
}
