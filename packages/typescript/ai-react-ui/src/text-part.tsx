import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

export interface TextPartProps {
  /** The text content to render */
  content: string;
  /** The role of the message (user, assistant, or system) - optional for standalone use */
  role?: "user" | "assistant" | "system";
  /** Base className applied to all text parts */
  className?: string;
  /** Additional className for user messages */
  userClassName?: string;
  /** Additional className for assistant messages (also used for system messages) */
  assistantClassName?: string;
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
 *   className="p-4 rounded"
 *   userClassName="bg-blue-500"
 *   assistantClassName="bg-gray-500"
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
 *         className="px-5 py-3 rounded-2xl"
 *         userClassName="bg-orange-500 text-white"
 *         assistantClassName="bg-gray-800 text-white"
 *       />
 *     )
 *   }}
 * />
 * ```
 */
export function TextPart({
  content,
  role,
  className = "",
  userClassName = "",
  assistantClassName = "",
}: TextPartProps) {
  // Combine classes based on role
  const roleClassName = role === "user" ? userClassName : role === "assistant" ? assistantClassName : "";
  const combinedClassName = [className, roleClassName].filter(Boolean).join(" ");

  return (
    <div className={combinedClassName || undefined}>
      <ReactMarkdown
        rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight, remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

