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
export { TextPart, type TextPartProps } from './chat-ui/text-part'
export { ThinkingPart, type ThinkingPartProps } from './chat-ui/thinking-part'
