/**
 * @tanstack/ai-react-ui
 * 
 * Headless React components for building AI chat interfaces.
 * 
 * Features:
 * - Parts-based message rendering (text, tool calls, tool results)
 * - Native tool approval workflows
 * - Client-side tool execution support
 * - Streaming support
 * - Fully customizable with render props
 * - Compound component pattern
 * 
 * @example
 * ```tsx
 * import { Chat } from '@tanstack/ai-react-ui'
 * 
 * <Chat connection={fetchServerSentEvents('/api/chat')}>
 *   <Chat.Messages>
 *     {(message) => <Chat.Message message={message} />}
 *   </Chat.Messages>
 *   <Chat.Input />
 * </Chat>
 * ```
 */

// Main components
export { Chat, useChatContext, type ChatProps } from "./chat";
export { ChatMessages, type ChatMessagesProps } from "./chat-messages";
export { ChatMessage, type ChatMessageProps } from "./chat-message";
export { ChatInput, type ChatInputProps, type ChatInputRenderProps } from "./chat-input";
export { ToolApproval, type ToolApprovalProps, type ToolApprovalRenderProps } from "./tool-approval";

// Compound component pattern
import { Chat } from "./chat";
import { ChatMessages } from "./chat-messages";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ToolApproval } from "./tool-approval";

// Attach subcomponents
(Chat as any).Messages = ChatMessages;
(Chat as any).Message = ChatMessage;
(Chat as any).Input = ChatInput;
(Chat as any).ToolApproval = ToolApproval;

// Re-export hooks from @tanstack/ai-react for convenience
export { useChat } from "@tanstack/ai-react";

// Re-export types from @tanstack/ai-react
export type {
  UIMessage,
  MessagePart,
  ToolCallPart,
  ToolResultPart,
  TextPart,
  ConnectionAdapter,
  UseChatOptions,
  UseChatReturn,
} from "@tanstack/ai-react";

