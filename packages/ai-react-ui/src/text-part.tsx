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
  remarkPlugins?: PluggableList
  rehypePlugins?: PluggableList
  /** react-markdown `components` overrides (e.g. custom `a`, `code`). */
  components?: Components
  disableDefaultPlugins?: boolean
}

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
