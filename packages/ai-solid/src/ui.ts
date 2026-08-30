// Barrel entry for the `@tanstack/ai-solid/ui` subpath.
export {
  Chat,
  useChatContext,
  type ChatUIComponents,
  type ChatUIHost,
  type InputProps,
  type InterruptProps,
  type LayoutProps,
  type MessageProps,
  type PartProps,
  type ToolProps,
} from './chat-ui/create-ui'
export {
  Chat as DeprecatedChat,
  useChatContext as useDeprecatedChatContext,
  type ChatProps,
} from './chat-ui/chat'
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
