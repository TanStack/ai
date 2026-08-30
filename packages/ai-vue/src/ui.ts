// Barrel entry for the `@tanstack/ai-vue/ui` subpath.
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
export { default as DeprecatedChat } from './chat-ui/chat.vue'
export { default as ChatInput } from './chat-ui/chat-input.vue'
export { default as ChatMessage } from './chat-ui/chat-message.vue'
export { default as ChatMessages } from './chat-ui/chat-messages.vue'
export { default as ThinkingPart } from './chat-ui/thinking-part.vue'
export { default as TextPart } from './chat-ui/text-part.vue'
export { default as ToolApproval } from './chat-ui/tool-approval.vue'
export type {
  ChatProps,
  ChatInputProps,
  ChatInputRenderProps,
  ChatMessageProps,
  ChatMessagesProps,
  ThinkingPartProps,
  TextPartProps,
  ToolApprovalProps,
  ToolApprovalRenderProps,
  ToolCallRenderProps,
} from './chat-ui/types'
