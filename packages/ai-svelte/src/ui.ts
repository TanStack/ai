// Barrel entry for the `@tanstack/ai-svelte/ui` subpath.
export { createChatUI, getUIContext } from './chat-ui/create-ui'
export { createChatHook } from './chat-ui/create-chat-hook'
export type {
  ChatUIComponents,
  ChatUIFactoryConfig,
  ChatUIHost,
  ChatUIQueueItem,
  InputProps,
  InterruptProps,
  LayoutProps,
  MessageProps,
  PartProps,
  QueueProps,
  ToolProps,
  UIDescriptor,
} from './chat-ui/create-ui'
export { default as UIChat } from './chat-ui/ui-chat.svelte'
export { default as UIProvider } from './chat-ui/ui-provider.svelte'
export { default as UIMessages } from './chat-ui/ui-messages.svelte'
export { default as UIMessage } from './chat-ui/ui-message.svelte'
export { default as UIPart } from './chat-ui/ui-part.svelte'
export { default as UIInterrupts } from './chat-ui/ui-interrupts.svelte'
export { default as UIInterrupt } from './chat-ui/ui-interrupt.svelte'
export { default as UIQueue } from './chat-ui/ui-queue.svelte'
