import { renderHtml } from '@tanstack/markdown/html'
import { streamingMarkdownExtension } from '@tanstack/markdown/extensions/streaming'
import type { CodeHighlighter, MarkdownExtension } from '@tanstack/markdown'

const DEFAULT_EXTENSIONS: Array<MarkdownExtension> = [
  streamingMarkdownExtension(),
]

export interface TextPartProps {
  /** The text content to render */
  content: string
  /** The role of the message - optional for standalone use */
  role?: 'user' | 'assistant' | 'system'
  /** Base class applied to all text parts */
  class?: string
  /** Additional class for user messages */
  userClass?: string
  /** Additional class for assistant messages */
  assistantClass?: string
  /** Extensions appended after the built-in streaming extension. */
  extensions?: Array<MarkdownExtension>
  /**
   * Synchronous code highlighter. Its output is inserted as trusted HTML,
   * so use only a highlighter that escapes source text (for example
   * `createTanStackMarkdownHighlighter` from `@tanstack/highlight/markdown`).
   */
  highlighter?: CodeHighlighter
}

/**
 * Renders streaming Markdown. Raw HTML is escaped and executable URLs are
 * removed by TanStack Markdown; custom highlighters must escape source text.
 */
export function TextPart(props: TextPartProps) {
  const roleClass = () =>
    props.role === 'user'
      ? (props.userClass ?? '')
      : props.role === 'assistant'
        ? (props.assistantClass ?? '')
        : ''
  const combinedClass = () =>
    [props.class ?? '', roleClass()].filter(Boolean).join(' ')

  // TanStack Markdown escapes this HTML string.
  const html = () =>
    renderHtml(props.content, {
      extensions: props.extensions
        ? [...DEFAULT_EXTENSIONS, ...props.extensions]
        : DEFAULT_EXTENSIONS,
      frontmatter: false,
      headingIds: false,
      highlighter: props.highlighter,
    })

  return <div class={combinedClass() || undefined} innerHTML={html()} />
}
