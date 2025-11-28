import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

export interface TextPartProps {
  /** The text content to render */
  content: string
  /** The role of the message (user, assistant, or system) - optional for standalone use */
  role?: 'user' | 'assistant' | 'system'
  /** Base class applied to all text parts */
  className?: string
  /** Additional class for user messages */
  userclass?: string
  /** Additional class for assistant messages (also used for system messages) */
  assistantclass?: string
}

/**
 * TextPart component - renders markdown text with syntax highlighting
 *
 * Features:
 * - Full markdown support with GFM (tables, strikethrough, etc.)
 * - Syntax highlighting for code blocks
 * - Sanitized HTML rendering
 * - Role-based styling (user vs assistant)
 *
 * @example Standalone usage
 * ```tsx
 * <TextPart
 *   content="Hello **world**!"
 *   role="user"
 *   class="p-4 rounded"
 *   userclass="bg-blue-500"
 *   assistantclass="bg-gray-500"
 * />
 * ```
 *
 * @example Usage in partRenderers
 * ```tsx
 * <ChatMessage
 *   message={message}
 *   partRenderers={{
 *     text: ({ content }) => (
 *       <TextPart
 *         content={content}
 *         role={message.role}
 *         class="px-5 py-3 rounded-2xl"
 *         userclass="bg-orange-500 text-white"
 *         assistantclass="bg-gray-800 text-white"
 *       />
 *     )
 *   }}
 * />
 * ```
 */
export function TextPart({
  content,
  role,
  className = '',
  userclass = '',
  assistantclass = '',
}: TextPartProps) {
  // Combine classes based on role
  const roleclass =
    role === 'user'
      ? userclass
      : role === 'assistant'
        ? assistantclass
        : ''
  const combinedclass = [className, roleclass].filter(Boolean).join(' ')

  return (
    <div class={combinedclass || undefined}>
      <ReactMarkdown
        rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight, remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
