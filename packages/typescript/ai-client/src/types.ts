import type {
  AnyClientTool,
  ChunkStrategy,
  InferToolInput,
  InferToolOutput,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'
import type { ConnectionAdapter } from './connection-adapters'

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

/**
 * Helper type that creates a tool-call part for a specific tool.
 * This is a conditional type to enable proper distribution over union types,
 * creating a discriminated union where `name` is the discriminant.
 */
type ToolCallPartForTool<T> = T extends AnyClientTool
  ? {
      type: 'tool-call'
      id: string
      name: T['name']
      arguments: string // JSON string (may be incomplete)
      /** Parsed tool input (typed from inputSchema) */
      input?: InferToolInput<T>
      state: ToolCallState
      /** Approval metadata if tool requires user approval */
      approval?: {
        id: string // Unique approval ID
        needsApproval: boolean // Always true if present
        approved?: boolean // User's decision (undefined until responded)
      }
      /** Tool execution output (for client tools or after approval) */
      output?: InferToolOutput<T>
    }
  : never

/**
 * Fallback tool-call part type when tools are not typed
 */
type UntypedToolCallPart = {
  type: 'tool-call'
  id: string
  name: string
  arguments: string
  input?: any
  state: ToolCallState
  approval?: {
    id: string
    needsApproval: boolean
    approved?: boolean
  }
  output?: any
}

/**
 * Tool call part that creates a proper discriminated union.
 * When TTools is typed, checking `part.name === 'toolName'` will narrow
 * `part.output` to the correct type for that tool.
 *
 * The discriminant is `name`, so code like:
 * ```ts
 * if (part.name === 'recommendGuitar') {
 *   // part.output is now typed to the recommendGuitar tool's output
 * }
 * ```
 */
export type ToolCallPart<TTools extends ReadonlyArray<AnyClientTool> = any> =
  // Check if we have a concrete tools array (not 'any' or 'never')
  [TTools] extends [never]
    ? UntypedToolCallPart
    : unknown extends TTools
      ? UntypedToolCallPart
      : TTools extends ReadonlyArray<infer Tool>
        ? Tool extends AnyClientTool
          ? ToolCallPartForTool<Tool>
          : UntypedToolCallPart
        : UntypedToolCallPart

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
  role: 'user' | 'assistant'
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

/**
 * Create a typed array of client tools with proper type inference.
 * This eliminates the need for `as const` when defining tool arrays.
 *
 * @example
 * ```ts
 * const tools = clientTools(
 *   myTool1.client(() => result1),
 *   myTool2.client(() => result2),
 * )
 *
 * // tools is now properly typed as a tuple with literal tool names
 * // This enables type narrowing when checking part.name === 'toolName'
 * ```
 */
export function clientTools<const T extends Array<AnyClientTool>>(
  ...tools: T
): T {
  return tools
}

/**
 * Helper to create typed chat client options
 * Use this to get proper type inference for messages
 *
 * @example
 * ```ts
 * const tools = clientTools(myTool1, myTool2)
 *
 * const chatOptions = createChatClientOptions({
 *   connection: fetchServerSentEvents('/api/chat'),
 *   tools,
 * })
 *
 * type MyMessages = InferChatMessages<typeof chatOptions>
 * ```
 */
export function createChatClientOptions<
  const TTools extends ReadonlyArray<AnyClientTool>,
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
