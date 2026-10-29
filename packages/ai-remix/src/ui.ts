// Barrel entry for the `@tanstack/ai-remix/ui` subpath.
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
} from './chat-ui/create-ui.tsx'
export { createChatHook } from './chat-ui/create-chat-hook.ts'
export { TextPart, type TextPartProps } from './chat-ui/text-part.tsx'
export {
  ThinkingPart,
  type ThinkingPartProps,
} from './chat-ui/thinking-part.tsx'
