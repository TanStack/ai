// Barrel entry for the `@tanstack/ai-vue/ui` subpath.
export { default as Chat } from './chat-ui/chat.vue'
export { default as ChatInput } from './chat-ui/chat-input.vue'
export { default as ChatMessage } from './chat-ui/chat-message.vue'
export { default as ChatMessages } from './chat-ui/chat-messages.vue'
export { default as ThinkingPart } from './chat-ui/thinking-part.vue'
export { default as TextPart } from './chat-ui/text-part.vue'
export { default as ToolApproval } from './chat-ui/tool-approval.vue'
export {
  createChatUI,
  createChatHookContexts,
  UIChat,
  UIProvider,
  UIMessages,
  UIMessage,
  UIPart,
  UIInterrupts,
  UIInterrupt,
  UIQueue,
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
  type UIDescriptor,
} from './chat-ui/create-ui'
export { createChatHook } from './chat-ui/create-chat-hook'
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
