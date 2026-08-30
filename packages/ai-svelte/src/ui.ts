// Barrel entry for the `@tanstack/ai-svelte/ui` subpath.
export { getUIContext } from './chat-ui/create-ui'
export type {
  ChatUIComponents,
  ChatUIHost,
  InputProps,
  InterruptProps,
  LayoutProps,
  MessageProps,
  PartProps,
  ToolProps,
  UIDescriptor,
} from './chat-ui/create-ui'
export { default as Chat } from './chat-ui/ui-chat.svelte'
export { default as UIProvider } from './chat-ui/ui-provider.svelte'
export { default as UIMessages } from './chat-ui/ui-messages.svelte'
export { default as UIMessage } from './chat-ui/ui-message.svelte'
export { default as UIPart } from './chat-ui/ui-part.svelte'
export { default as UIInterrupts } from './chat-ui/ui-interrupts.svelte'
export { default as UIInterrupt } from './chat-ui/ui-interrupt.svelte'
