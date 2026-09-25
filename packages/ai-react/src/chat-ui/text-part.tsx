import { Markdown } from '@tanstack/markdown/react'
import { streamingMarkdownExtension } from '@tanstack/markdown/extensions/streaming'
import type { CodeHighlighter, MarkdownExtension } from '@tanstack/markdown'
import type { MarkdownComponents } from '@tanstack/markdown/react'

const DEFAULT_EXTENSIONS: Array<MarkdownExtension> = [
  streamingMarkdownExtension(),
]

export interface TextPartProps {
  /** The text content to render */
  content: string
  /** The role of the message (user, assistant, or system) - optional for standalone use */
  role?: 'user' | 'assistant' | 'system'
  /** Base className applied to all text parts */
  className?: string
  /** Additional className for user messages */
  userClassName?: string
  /** Additional className for assistant messages (also used for system messages) */
  assistantClassName?: string
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
  /** Replace intrinsic elements (e.g. custom `a`, `img`) by tag name. */
  components?: MarkdownComponents
}

/**
 * TextPart component - renders markdown text with TanStack Markdown.
 *
 * Raw HTML is escaped and executable URLs are removed, so AI output can be
 * rendered without a separate sanitizer.
 *
 * @example Standalone usage
 * ```tsx
 * <TextPart
 *   content="Hello **world**!"
 *   role="user"
 *   className="p-4 rounded"
 *   userClassName="bg-blue-500"
 *   assistantClassName="bg-gray-500"
 * />
 * ```
 *
 * @example Syntax highlighting
 * ```tsx
 * import { highlightMarkdownCode } from './markdown-highlighter'
 *
 * <TextPart content={content} highlighter={highlightMarkdownCode} />
 * ```
 */
export function TextPart({
  content,
  role,
  className = '',
  userClassName = '',
  assistantClassName = '',
  extensions,
  highlighter,
  components,
}: TextPartProps) {
  const roleClassName =
    role === 'user'
      ? userClassName
      : role === 'assistant'
        ? assistantClassName
        : ''
  const combinedClassName = [className, roleClassName].filter(Boolean).join(' ')

  return (
    <div className={combinedClassName || undefined}>
      <Markdown
        extensions={
          extensions
            ? [...DEFAULT_EXTENSIONS, ...extensions]
            : DEFAULT_EXTENSIONS
        }
        frontmatter={false}
        headingIds={false}
        highlighter={highlighter}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  )
}
