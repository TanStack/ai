// Barrel entry for the `@tanstack/ai-react/ui` subpath. The JSX
// implementation lives under `./chat-ui`; this `.ts` re-export exists so
// kiira's dist->src resolution (which maps `dist/esm/ui.d.ts` to `src/ui.ts`,
// never a directory index) can type-check docs snippets that import this
// subpath.
export {
  createChatUI,
  type ChatUIComponents,
  type ChatUIFactoryConfig,
  type ChatUIHost,
  type InputProps,
  type InterruptProps,
  type LayoutProps,
  type MessageProps,
  type PartProps,
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
