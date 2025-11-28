import { Show, createSignal, onMount } from 'solid-js'
import type { Component } from 'solid-js'

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

// Lazy load SolidMarkdown and plugins to avoid SSR issues
let SolidMarkdown: Component<any> | null = null
let remarkGfm: any = null
let rehypeRaw: any = null
let rehypeSanitize: any = null
let rehypeHighlight: any = null

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
  const [isClient, setIsClient] = createSignal(false)
  const [isLoaded, setIsLoaded] = createSignal(false)

  // Combine classes based on role
  const roleClass = () =>
    props.role === 'user'
      ? (props.userClass ?? '')
      : props.role === 'assistant'
        ? (props.assistantClass ?? '')
        : ''
  const combinedClass = () =>
    [props.class ?? '', roleClass()].filter(Boolean).join(' ')

  onMount(async () => {
    setIsClient(true)
    // Dynamically import solid-markdown and plugins only on the client
    const [
      markdownModule,
      gfmModule,
      rawModule,
      sanitizeModule,
      highlightModule,
    ] = await Promise.all([
      import('solid-markdown'),
      import('remark-gfm'),
      import('rehype-raw'),
      import('rehype-sanitize'),
      import('rehype-highlight'),
    ])
    SolidMarkdown = markdownModule.SolidMarkdown
    remarkGfm = gfmModule.default
    rehypeRaw = rawModule.default
    rehypeSanitize = sanitizeModule.default
    rehypeHighlight = highlightModule.default
    setIsLoaded(true)
  })

  return (
    <div class={combinedClass() || undefined}>
      <Show
        when={isClient() && isLoaded() && SolidMarkdown}
        fallback={<span>{props.content}</span>}
      >
        {(_) => {
          const Markdown = SolidMarkdown!
          return (
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
            >
              {props.content}
            </Markdown>
          )
        }}
      </Show>
    </div>
  )
}
