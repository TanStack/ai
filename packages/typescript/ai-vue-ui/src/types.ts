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
