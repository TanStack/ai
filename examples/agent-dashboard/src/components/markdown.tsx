/**
 * Message text is LLM output (the sentiment digest is a markdown table + prose),
 * so render it as markdown. react-markdown doesn't emit raw HTML by default, so
 * no sanitize plugin is needed for this untrusted content; remark-gfm adds the
 * table/strikethrough/autolink support the digests use.
 *
 * ponytail: reuse the sibling examples' markdown stack; `prose` (Tailwind
 * typography defaults) is enough styling without a custom component map.
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
