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
  type ChatUIQueueItem,
  type InputProps,
  type InterruptProps,
  type LayoutProps,
  type MessageProps,
  type PartProps,
  type QueueProps,
  type SubagentPartsProps,
  type SubagentProps,
  type ToolProps,
} from './chat-ui/create-ui'
export { createChatHook } from './chat-ui/create-chat-hook'
export {
  createChatHookContexts,
  type ChatUIContexts,
} from './chat-ui/create-ui-contexts'
export { TextPart, type TextPartProps } from './chat-ui/text-part'
export { ThinkingPart, type ThinkingPartProps } from './chat-ui/thinking-part'
