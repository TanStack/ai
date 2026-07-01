import { createFileRoute } from '@tanstack/react-router'
import { TextPart } from '@tanstack/ai-react-ui'
import remarkCjkFriendly from 'remark-cjk-friendly'

export const Route = createFileRoute('/markdown-cjk')({
  component: MarkdownCjkPage,
})

// CommonMark refuses to close `**` when the closing delimiter is preceded by
// full-width punctuation (e.g. `。`) and followed by a CJK letter, because the
// right-flanking rule fails. remark-cjk-friendly relaxes that rule for CJK
// text, so the bold parses correctly.
const CJK_CONTENT = '**この文は太字になりません。**この文のせいで。'

function MarkdownCjkPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <h1 className="text-xl font-semibold">CJK bold rendering</h1>
      <section data-testid="without-plugin">
        <h2 className="font-medium mb-2">Without remark-cjk-friendly</h2>
        <TextPart content={CJK_CONTENT} />
      </section>
      <section data-testid="with-plugin">
        <h2 className="font-medium mb-2">With remark-cjk-friendly</h2>
        <TextPart content={CJK_CONTENT} remarkPlugins={[remarkCjkFriendly]} />
      </section>
    </div>
  )
}
