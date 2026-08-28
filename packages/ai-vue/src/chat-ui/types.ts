import type { ConnectionAdapter } from '@tanstack/ai-client'
import type { UIMessage } from '../types'
import type { PluggableList } from '@crazydos/vue-markdown'

/** @deprecated Use `createChatUI()` from `@tanstack/ai-vue-ui`. Deprecated in 0.3.0. Removed in 1.0.0. */
export interface ChatProps {
  /** CSS class name for the root element */
  class?: string
  /** Connection adapter for communicating with your API */
  connection: ConnectionAdapter
  /** Initial messages to display */
  initialMessages?: Array<UIMessage>
  /** Custom message ID generator */
  id?: string
  /** Additional body data to send with requests */
  body?: any
  /** Client-side tools with execute functions */
  tools?: Array<any>
  /** Custom tool components registry for rendering */
  // toolComponents?: Record<
  //   string,
  //   (props: { input: any; output?: any }) => JSX.Element
  // >
}

/** @deprecated Use `createChatUI()` and an application-owned input component. Deprecated in 0.3.0. Removed in 1.0.0. */
export interface ChatInputProps {
  /** CSS class name */
  class?: string
  /** Placeholder text */
  placeholder?: string
  /** Disable input */
  disabled?: boolean
  /** Submit on Enter (Shift+Enter for new line) */
  submitOnEnter?: boolean
}

/** @deprecated Use `createChatUI()` and an application-owned input component. Deprecated in 0.3.0. Removed in 1.0.0. */
export interface ChatInputRenderProps {
  /** Current input value (use v-model on ChatInput to control) */
  value: string
  /** Submit the message */
  onSubmit: () => void
  /** Is the chat currently loading */
  isLoading: boolean
  /** Is input disabled */
  disabled: boolean
}

export interface ThinkingPartProps {
  /** The thinking content to render */
  content: string
  /** Base class applied to thinking parts */
  class?: string
  /** Whether thinking is complete (has text content after) */
  isComplete?: boolean
}

/** @deprecated Use `createChatUI()` tool components instead. Deprecated in 0.3.0. Removed in 1.0.0. */
export interface ToolCallRenderProps {
  id: string
  name: string
  arguments: string
  state: string
  approval?: any
  output?: any
}

/** @deprecated Use `createChatUI()` Message instead. Deprecated in 0.3.0. Removed in 1.0.0. */
export interface ChatMessageProps {
  /** The message to render (accepts readonly from useChat) */
  message: any // Using any to accept DeepReadonly<UIMessage> from useChat
  /** Base CSS class name */
  class?: string
  /** Additional class for user messages */
  userClass?: string
  /** Additional class for assistant messages */
  assistantClass?: string
}

/** @deprecated Use `createChatUI()` Messages instead. Deprecated in 0.3.0. Removed in 1.0.0. */
export interface ChatMessagesProps {
  /** CSS class name */
  class?: string
  /** Auto-scroll to bottom on new messages */
  autoScroll?: boolean
}

export interface TextPartProps {
  /** The text content to render */
  content: string
  /** The role of the message (user, assistant, or system) - optional for standalone use */
  role?: 'user' | 'assistant' | 'system'
  /** Base class applied to all text parts */
  class?: string
  /** Additional class for user messages */
  userClass?: string
  /** Additional class for assistant messages (also used for system messages) */
  assistantClass?: string
  /** Additional remark plugins, appended after the defaults. */
  remarkPlugins?: PluggableList
  /** Additional rehype plugins, appended after the defaults. */
  rehypePlugins?: PluggableList
  /**
   * Drop the built-in plugin defaults and disable the renderer's built-in
   * sanitizer. The caller becomes responsible for sanitization.
   */
  disableDefaultPlugins?: boolean
}

/** @deprecated Use `createChatUI()` interrupt components with `chat.interrupts`. Deprecated in 0.3.0. Removed in 1.0.0. */
export interface ToolApprovalProps {
  /** Tool call ID */
  toolCallId: string
  /** Tool name */
  toolName: string
  /** Parsed tool arguments/input */
  input: any
  /** Approval metadata */
  approval: {
    id: string
    needsApproval: boolean
    approved?: boolean
  }
  /** CSS class name */
  class?: string
}

/** @deprecated Use `createChatUI()` interrupt components with `chat.interrupts`. Deprecated in 0.3.0. Removed in 1.0.0. */
export interface ToolApprovalRenderProps {
  /** Tool name */
  toolName: string
  /** Parsed input */
  input: any
  /** Approve the tool call */
  onApprove: () => void
  /** Deny the tool call */
  onDeny: () => void
  /** Whether user has responded */
  hasResponded: boolean
  /** User's decision (if responded) */
  approved?: boolean
}
