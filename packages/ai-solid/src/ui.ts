// Barrel entry for the `@tanstack/ai-solid/ui` subpath.
export {
  createChatUI,
  type ChatUIComponents,
  type ChatUIFactoryConfig,
  type ChatUIHost,
  type ChatUIQueueItem,
  type InputProps,
  type InterruptProps,
  type LayoutProps,
  type MessageProps,
  type PartProps,
  type QueueProps,
  type ToolProps,
} from './chat-ui/create-ui'
export { createChatHook } from './chat-ui/create-chat-hook'
export {
  createChatHookContexts,
  type ChatUIContexts,
} from './chat-ui/create-ui-contexts'
export { Chat, useChatContext, type ChatProps } from './chat-ui/chat'
export { ChatMessages, type ChatMessagesProps } from './chat-ui/chat-messages'
export {
  ChatMessage,
  type ChatMessageProps,
  type ToolCallRenderProps,
} from './chat-ui/chat-message'
export {
  ChatInput,
  type ChatInputProps,
  type ChatInputRenderProps,
} from './chat-ui/chat-input'
export {
  ToolApproval,
  type ToolApprovalProps,
  type ToolApprovalRenderProps,
} from './chat-ui/tool-approval'
export { TextPart, type TextPartProps } from './chat-ui/text-part'
export { ThinkingPart, type ThinkingPartProps } from './chat-ui/thinking-part'
