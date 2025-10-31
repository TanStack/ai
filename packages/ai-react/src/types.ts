import type { Message } from "@tanstack/ai";
import type {
  ChatClientOptions,
  ChatMessage,
  ChatRequestBody,
} from "@tanstack/ai-client";

// Re-export types from ai-client
export type { ChatMessage, ChatRequestBody };

// UseChatOptions is the same as ChatClientOptions
// (we omit the state change callbacks since React hooks manage that internally)
export type UseChatOptions = Omit<
  ChatClientOptions,
  "onMessagesChange" | "onLoadingChange" | "onErrorChange"
>;

export interface UseChatReturn {
  /**
   * Current messages in the conversation
   */
  messages: ChatMessage[];

  /**
   * Send a message and get a response
   */
  sendMessage: (content: string) => Promise<void>;

  /**
   * Append a message to the conversation
   */
  append: (message: Message | ChatMessage) => Promise<void>;

  /**
   * Reload the last assistant message
   */
  reload: () => Promise<void>;

  /**
   * Stop the current response generation
   */
  stop: () => void;

  /**
   * Whether a response is currently being generated
   */
  isLoading: boolean;

  /**
   * Current error, if any
   */
  error: Error | undefined;

  /**
   * Set messages manually
   */
  setMessages: (messages: ChatMessage[]) => void;

  /**
   * Clear all messages
   */
  clear: () => void;
}
