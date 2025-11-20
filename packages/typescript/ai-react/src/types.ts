import type { ModelMessage } from "@tanstack/ai";
import type {
  ChatClientOptions,
  UIMessage,
  ChatRequestBody,
} from "@tanstack/ai-client";

// Re-export types from ai-client
export type { UIMessage, ChatRequestBody };

/**
 * Options for the useChat hook.
 * 
 * This extends ChatClientOptions but omits the state change callbacks that are
 * managed internally by React state:
 * - `onMessagesChange` - Managed by React state (exposed as `messages`)
 * - `onLoadingChange` - Managed by React state (exposed as `isLoading`)
 * - `onErrorChange` - Managed by React state (exposed as `error`)
 * 
 * All other callbacks (onResponse, onChunk, onFinish, onError, onToolCall) are
 * passed through to the underlying ChatClient and can be used for side effects.
 * 
 * Note: Connection and body changes will recreate the ChatClient instance.
 * To update these options, remount the component or use a key prop.
 */
export type UseChatOptions = Omit<
  ChatClientOptions,
  "onMessagesChange" | "onLoadingChange" | "onErrorChange"
>;

export interface UseChatReturn {
  /**
   * Current messages in the conversation
   */
  messages: UIMessage[];

  /**
   * Send a message and get a response
   */
  sendMessage: (content: string) => Promise<void>;

  /**
   * Append a message to the conversation
   */
  append: (message: ModelMessage | UIMessage) => Promise<void>;

  /**
   * Add the result of a client-side tool execution
   */
  addToolResult: (result: {
    toolCallId: string;
    tool: string;
    output: any;
    state?: "output-available" | "output-error";
    errorText?: string;
  }) => Promise<void>;

  /**
   * Respond to a tool approval request
   */
  addToolApprovalResponse: (response: {
    id: string; // approval.id, not toolCallId
    approved: boolean;
  }) => Promise<void>;

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
  setMessages: (messages: UIMessage[]) => void;

  /**
   * Clear all messages
   */
  clear: () => void;
}
