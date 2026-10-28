// Barrel entry for the `@tanstack/ai-vue/ui` subpath.
export { default as ThinkingPart } from './chat-ui/thinking-part.vue'
export { default as TextPart } from './chat-ui/text-part.vue'
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
export type { ThinkingPartProps, TextPartProps } from './chat-ui/types'
