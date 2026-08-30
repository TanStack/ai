// Barrel entry for the `@tanstack/ai-react/ui` subpath. The JSX
// implementation lives under `./chat-ui`; this `.ts` re-export exists so
// kiira's dist->src resolution (which maps `dist/esm/ui.d.ts` to `src/ui.ts`,
// never a directory index) can type-check docs snippets that import this
// subpath.
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
export { TextPart, type TextPartProps } from './chat-ui/text-part'
export { ThinkingPart, type ThinkingPartProps } from './chat-ui/thinking-part'
