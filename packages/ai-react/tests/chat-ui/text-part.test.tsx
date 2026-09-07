import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TextPart } from '../../src/chat-ui/text-part'

describe('TextPart', () => {
  it('renders markdown and escapes raw HTML', () => {
    const html = renderToStaticMarkup(
      <TextPart
        role="user"
        className="base"
        userClassName="user"
        content={'**bold** <script>alert(1)</script>'}
      />,
    )
    expect(html).toContain('class="base user"')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('applies a custom highlighter to fenced code', () => {
    const html = renderToStaticMarkup(
      <TextPart
        content={'```ts\nconst x = 1\n```'}
        highlighter={(code, lang) => `<span data-lang="${lang}">${code}</span>`}
      />,
    )
    expect(html).toContain('<span data-lang="ts">const x = 1</span>')
  })
})
