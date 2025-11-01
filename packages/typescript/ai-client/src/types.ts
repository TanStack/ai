import type { Message, StreamChunk } from "@tanstack/ai";
import type { ConnectionAdapter } from "./connection-adapters";
import type { ChunkStrategy, StreamParser } from "./stream/types";

export interface ChatMessage extends Message {
  id: string;
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
  initialMessages?: ChatMessage[];

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
  onFinish?: (message: ChatMessage) => void;

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;

  /**
   * Callback when messages change
   */
  onMessagesChange?: (messages: ChatMessage[]) => void;

  /**
   * Callback when loading state changes
   */
  onLoadingChange?: (isLoading: boolean) => void;

  /**
   * Callback when error state changes
   */
  onErrorChange?: (error: Error | undefined) => void;

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
  messages: Message[];
  data?: Record<string, any>;
}
