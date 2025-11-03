import type { ModelMessage, StreamChunk } from "@tanstack/ai";
import type { ConnectionAdapter } from "./connection-adapters";
import type { ChunkStrategy, StreamParser } from "./stream/types";

/**
 * Tool call states - track the lifecycle of a tool call
 */
export type ToolCallState =
  | "awaiting-input" // Received start but no arguments yet
  | "input-streaming" // Partial arguments received
  | "input-complete" // All arguments received
  | "approval-requested" // Waiting for user approval
  | "approval-responded"; // User has approved/denied

/**
 * Tool result states - track the lifecycle of a tool result
 */
export type ToolResultState =
  | "streaming" // Placeholder for future streamed output
  | "complete" // Result is complete
  | "error"; // Error occurred

/**
 * Message parts - building blocks of UIMessage
 */
export interface TextPart {
  type: "text";
  content: string;
}

export interface ToolCallPart {
  type: "tool-call";
  id: string;
  name: string;
  arguments: string; // JSON string (may be incomplete)
  state: ToolCallState;
  /** Approval metadata if tool requires user approval */
  approval?: {
    id: string; // Unique approval ID
    needsApproval: boolean; // Always true if present
    approved?: boolean; // User's decision (undefined until responded)
  };
  /** Tool execution output (for client tools or after approval) */
  output?: any;
}

export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  content: string;
  state: ToolResultState;
  error?: string; // Error message if state is "error"
}

export type MessagePart = TextPart | ToolCallPart | ToolResultPart;

/**
 * UIMessage - Domain-specific message format optimized for building chat UIs
 * Contains parts that can be text, tool calls, or tool results
 */
export interface UIMessage {
  id: string;
  role: "system" | "user" | "assistant";
  parts: MessagePart[];
  createdAt?: Date;
}

export interface ChatClientOptions {
  /**
   * Connection adapter for streaming
   * Use fetchServerSentEvents(), fetchHttpStream(), or stream() to create adapters
   */
  connection: ConnectionAdapter;

  /**
   * Initial messages to populate the chat
   */
  initialMessages?: UIMessage[];

  /**
   * Unique identifier for this chat instance
   * Used for managing multiple chats
   */
  id?: string;

  /**
   * Additional body parameters to send
   */
  body?: Record<string, any>;

  /**
   * Callback when a response is received
   */
  onResponse?: (response?: Response) => void | Promise<void>;

  /**
   * Callback when a stream chunk is received
   */
  onChunk?: (chunk: StreamChunk) => void;

  /**
   * Callback when the response is finished
   */
  onFinish?: (message: UIMessage) => void;

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;

  /**
   * Callback when messages change
   */
  onMessagesChange?: (messages: UIMessage[]) => void;

  /**
   * Callback when loading state changes
   */
  onLoadingChange?: (isLoading: boolean) => void;

  /**
   * Callback when error state changes
   */
  onErrorChange?: (error: Error | undefined) => void;

  /**
   * Callback when a client-side tool needs to be executed
   * Tool has no execute function - client must provide the result
   */
  onToolCall?: (args: {
    toolCallId: string;
    toolName: string;
    input: any;
  }) => Promise<any>;

  /**
   * Stream processing options (optional)
   * Configure chunking strategy and custom parsers
   */
  streamProcessor?: {
    /**
     * Strategy for when to emit text updates
     * Defaults to ImmediateStrategy (every chunk)
     */
    chunkStrategy?: ChunkStrategy;

    /**
     * Custom stream parser
     * Override to handle different stream formats
     */
    parser?: StreamParser;
  };
}

export interface ChatRequestBody {
  messages: ModelMessage[];
  data?: Record<string, any>;
}
