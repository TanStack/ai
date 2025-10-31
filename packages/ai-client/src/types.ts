import type { Message, StreamChunk } from "@tanstack/ai";

export interface ChatMessage extends Message {
  id: string;
  createdAt?: Date;
}

export interface ChatClientOptions {
  /**
   * The API endpoint to send messages to
   * @default "/api/chat"
   */
  api?: string;

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
   * Callback when a response is received
   */
  onResponse?: (response: Response) => void | Promise<void>;

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
   * Additional headers to send with the request
   */
  headers?: Record<string, string> | Headers;

  /**
   * Additional body parameters to send
   */
  body?: Record<string, any>;

  /**
   * Credentials mode for fetch
   * @default "same-origin"
   */
  credentials?: "omit" | "same-origin" | "include";

  /**
   * Custom fetch implementation
   */
  fetch?: typeof fetch;
}

export interface ChatRequestBody {
  messages: Message[];
  data?: Record<string, any>;
}

