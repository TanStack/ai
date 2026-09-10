import { render } from 'solid-js/web'
import { describe, expect, it } from 'vitest'
import { TextPart } from '../../src/chat-ui/text-part'

function renderHtml(node: () => unknown) {
  const container = document.createElement('div')
  render(node as () => never, container)
  return container.innerHTML
}

describe('TextPart', () => {
  it('renders markdown and escapes raw HTML', () => {
    const html = renderHtml(() => (
      <TextPart
        role="user"
        class="base"
        userClass="user"
        content={'**bold** <script>alert(1)</script>'}
      />
    ))
    expect(html).toContain('class="base user"')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('applies a custom highlighter to fenced code', () => {
    const html = renderHtml(() => (
      <TextPart
        content={'```ts\nconst x = 1\n```'}
        highlighter={(code, lang) => `<span data-lang="${lang}">${code}</span>`}
      />
    ))
    expect(html).toContain('<span data-lang="ts">const x = 1</span>')
  })
})

describe('TextPart streaming', () => {
  it('keeps partial code verbatim at every character boundary', () => {
    const full =
      '```json\n{ name: "john", age: 3 }\n```\n\nInline `{ name: "john" }`.'
    for (let i = 1; i <= full.length; i++) {
      const src = full.slice(0, i)
      const html = renderHtml(() => <TextPart content={src} />)
      const partial = src.match(/\{ name: "[a-z"]*/)?.[0]
      if (partial) {
        expect(html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"')).toContain(
          partial,
        )
      }
    }
  })
})
