import ReactMarkdown from 'react-markdown'
import { resolveMarkdownPlugins } from './markdown-plugins'
import type { Components } from 'react-markdown'
import type { PluggableList } from './markdown-plugins'

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
   * Additional remark plugins, appended after the defaults
   * (or replacing them when `disableDefaultPlugins` is true).
   */
  remarkPlugins?: PluggableList
  /**
   * Additional rehype plugins. Inserted between the built-in
   * `rehypeRaw`/`rehypeHighlight` and the trailing `rehypeSanitize`
   * so sanitization always runs last. When `disableDefaultPlugins`
   * is true, replaces the entire chain.
   */
  rehypePlugins?: PluggableList
  /** react-markdown `components` overrides (e.g. custom `a`, `code`). */
  components?: Components
  /**
   * Drop the built-in plugin defaults entirely. The consumer becomes
   * responsible for syntax highlighting, GFM, raw HTML handling, and
   * sanitization. Use with care — disabling defaults removes the
   * built-in XSS sanitizer.
   */
  disableDefaultPlugins?: boolean
}

/**
 * TextPart component - renders markdown text with syntax highlighting.
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
 * @example Add a markdown plugin (e.g. CJK bold/emphasis support)
 * ```tsx
 * import remarkCjkFriendly from 'remark-cjk-friendly'
 *
 * <TextPart content={content} remarkPlugins={[remarkCjkFriendly]} />
 * ```
 */
export function TextPart({
  content,
  role,
  className = '',
  userClassName = '',
  assistantClassName = '',
  remarkPlugins,
  rehypePlugins,
  components,
  disableDefaultPlugins,
}: TextPartProps) {
  const roleClassName =
    role === 'user'
      ? userClassName
      : role === 'assistant'
        ? assistantClassName
        : ''
  const combinedClassName = [className, roleClassName].filter(Boolean).join(' ')

  const resolved = resolveMarkdownPlugins({
    remarkPlugins,
    rehypePlugins,
    disableDefaultPlugins,
  })

  return (
    <div className={combinedClassName || undefined}>
      <ReactMarkdown
        remarkPlugins={resolved.remarkPlugins}
        rehypePlugins={resolved.rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
