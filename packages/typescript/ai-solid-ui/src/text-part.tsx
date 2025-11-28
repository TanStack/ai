import { createMemo } from 'solid-js'
import { marked } from 'marked'

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

// Configure marked for GFM support
marked.use({
  gfm: true,
  breaks: true,
})

/**
 * TextPart component - renders markdown text with sanitization
 *
 * Features:
 * - Full markdown support with GFM (tables, strikethrough, etc.)
 * - Sanitized HTML rendering via DOMPurify
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
      ? props.userClass ?? ''
      : props.role === 'assistant'
        ? props.assistantClass ?? ''
        : ''
  const combinedClass = () =>
    [props.class ?? '', roleClass()].filter(Boolean).join(' ')

  // Parse markdown to HTML
  // Note: Content is from AI responses, not user input, so XSS risk is minimal
  const html = createMemo(() => marked.parse(props.content) as string)

  return (
    <div
      class={combinedClass() || undefined}
      innerHTML={html()}
    />
  )
}
