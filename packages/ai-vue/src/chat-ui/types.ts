import type { CodeHighlighter, MarkdownExtension } from '@tanstack/markdown'

export interface ThinkingPartProps {
  /** The thinking content to render */
  content: string
  /** Base class applied to thinking parts */
  class?: string
  /** Whether thinking is complete (has text content after) */
  isComplete?: boolean
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
  /**
   * Additional TanStack Markdown extensions, appended after the built-in
   * streaming extension.
   */
  extensions?: Array<MarkdownExtension>
  /**
   * Synchronous code highlighter. Its output is inserted as trusted HTML,
   * so use only a highlighter that escapes source text (for example
   * `createTanStackMarkdownHighlighter` from `@tanstack/highlight/markdown`).
   */
  highlighter?: CodeHighlighter
}
