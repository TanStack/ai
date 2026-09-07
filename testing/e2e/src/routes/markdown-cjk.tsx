import { createFileRoute } from '@tanstack/react-router'
import { TextPart } from '@tanstack/ai-react/ui'

export const Route = createFileRoute('/markdown-cjk')({
  component: MarkdownCjkPage,
})

// CommonMark refuses to close `**` when the closing delimiter is preceded by
// full-width punctuation (e.g. `。`) and followed by a CJK letter, because the
// right-flanking rule fails. TanStack Markdown does not apply that rule, so
// CJK bold parses correctly without a plugin.
const CJK_CONTENT = '**この文は太字になりません。**この文のせいで。'

function MarkdownCjkPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <h1 className="text-xl font-semibold">CJK bold rendering</h1>
      <section data-testid="cjk-bold">
        <TextPart content={CJK_CONTENT} />
      </section>
    </div>
  )
}
