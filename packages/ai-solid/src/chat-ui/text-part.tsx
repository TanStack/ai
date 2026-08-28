import { SolidMarkdown } from 'solid-markdown'
import { resolveMarkdownPlugins } from './markdown-plugins'
import type { SolidMarkdownComponents } from 'solid-markdown'
import type { PluggableList } from './markdown-plugins'

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
  /** Additional remark plugins, appended after the defaults. */
  remarkPlugins?: PluggableList
  /**
   * Additional rehype plugins. Inserted before the trailing
   * `rehypeSanitize` so sanitization always runs last.
   */
  rehypePlugins?: PluggableList
  /** solid-markdown `components` overrides. */
  components?: SolidMarkdownComponents
  /**
   * Drop the built-in plugin defaults entirely. Disables the XSS
   * sanitizer; the caller becomes responsible for sanitization.
   */
  disableDefaultPlugins?: boolean
}

/**
 * TextPart component - renders markdown text with syntax highlighting.
 *
 * @example Add a markdown plugin (e.g. CJK bold/emphasis support)
 * ```tsx
 * import remarkCjkFriendly from 'remark-cjk-friendly'
 *
 * <TextPart content={content} remarkPlugins={[remarkCjkFriendly]} />
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

  const resolved = () =>
    resolveMarkdownPlugins({
      remarkPlugins: props.remarkPlugins,
      rehypePlugins: props.rehypePlugins,
      disableDefaultPlugins: props.disableDefaultPlugins,
    })

  return (
    <div class={combinedClass() || undefined}>
      <SolidMarkdown
        remarkPlugins={resolved().remarkPlugins}
        rehypePlugins={resolved().rehypePlugins}
        components={props.components}
      >
        {props.content}
      </SolidMarkdown>
    </div>
  )
}
