import { SolidMarkdown } from 'solid-markdown'
import remarkGfm from 'remark-gfm'

import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'

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
 *   userClass="bg-blue-500"
 *   assistantClass="bg-gray-500"
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
 *         userClass="bg-orange-500 text-white"
 *         assistantClass="bg-gray-800 text-white"
 *       />
 *     )
 *   }}
 * />
 * ```
 */
export function TextPart(props: TextPartProps) {
  // Combine classes based on role
  const roleClass = () =>
    props.role === 'user'
      ? (props.userClass ?? '')
      : props.role === 'assistant'
        ? (props.assistantClass ?? '')
        : ''
  const combinedClass = () =>
    [props.class ?? '', roleClass()].filter(Boolean).join(' ')

  return (
    <div class={combinedClass() || undefined}>
      <SolidMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
      >
        {props.content}
      </SolidMarkdown>
    </div>
  )
}
