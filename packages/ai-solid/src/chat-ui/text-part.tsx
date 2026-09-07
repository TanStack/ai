import { renderHtml } from '@tanstack/markdown/html'
import { streamingMarkdownExtension } from '@tanstack/markdown/extensions/streaming'
import type { CodeHighlighter, MarkdownExtension } from '@tanstack/markdown'

const DEFAULT_EXTENSIONS: Array<MarkdownExtension> = [
  streamingMarkdownExtension(),
]

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

/**
 * TextPart component - renders markdown text with TanStack Markdown.
 *
 * Raw HTML is escaped and executable URLs are removed, so AI output can be
 * rendered without a separate sanitizer.
 *
 * @example Syntax highlighting
 * ```tsx
 * import { highlightMarkdownCode } from './markdown-highlighter'
 *
 * <TextPart content={content} highlighter={highlightMarkdownCode} />
 * ```
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

  // ponytail: TanStack Markdown has no Solid adapter, so render its (escaped)
  // HTML string. Walk the AST with renderBlock/renderInline if per-element
  // component overrides are ever needed.
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
