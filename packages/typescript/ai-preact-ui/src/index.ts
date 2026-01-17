/**
 * @tanstack/ai-preact-ui
 *
 * Headless Preact components for building AI chat interfaces.
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
 * import { Chat, ChatMessages, ChatInput, ChatMessage } from '@tanstack/ai-preact-ui'
 *
 * <Chat connection={fetchServerSentEvents('/api/chat')}>
 *   <ChatMessages>
 *     {(message) => <ChatMessage message={message} />}
 *   </ChatMessages>
 *   <ChatInput />
 * </Chat>
 * ```
 */

// Main components
export { Chat, useChatContext, type ChatProps } from './chat'
export { ChatMessages, type ChatMessagesProps } from './chat-messages'
export {
  ChatMessage,
  type ChatMessageProps,
  type ToolCallRenderProps,
} from './chat-message'
export {
  ChatInput,
  type ChatInputProps,
  type ChatInputRenderProps,
} from './chat-input'
export {
  ToolApproval,
  type ToolApprovalProps,
  type ToolApprovalRenderProps,
} from './tool-approval'
export { TextPart, type TextPartProps } from './text-part'
export { ThinkingPart, type ThinkingPartProps } from './thinking-part'

// Re-export hooks from @tanstack/ai-preact for convenience
export { useChat } from '@tanstack/ai-preact'

// Re-export types from @tanstack/ai-preact
export type {
  UIMessage,
  MessagePart,
  ToolCallPart,
  ToolResultPart,
  TextPart as TextPartType,
  ConnectionAdapter,
} from '@tanstack/ai-client'

export type { UseChatOptions, UseChatReturn } from '@tanstack/ai-preact'
