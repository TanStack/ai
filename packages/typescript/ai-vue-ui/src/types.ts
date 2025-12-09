import type { ConnectionAdapter, UIMessage } from '@tanstack/ai-vue'

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

export interface ToolCallRenderProps {
  id: string
  name: string
  arguments: string
  state: string
  approval?: any
  output?: any
}

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
}

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
