import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import TextPart from '../../src/chat-ui/text-part.vue'
import { renderVueText } from './test-renderer'

describe('TextPart', () => {
  it('renders markdown and escapes raw HTML', async () => {
    const html = await renderVueText(
      defineComponent(
        () => () =>
          h(TextPart, {
            role: 'user',
            class: 'base',
            userClass: 'user',
            content: '**bold** <script>alert(1)</script>',
          }),
      ),
    )
    expect(html).toContain('class="base user"')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('applies a custom highlighter to fenced code', async () => {
    const html = await renderVueText(
      defineComponent(
        () => () =>
          h(TextPart, {
            content: '```ts\nconst x = 1\n```',
            highlighter: (code: string, lang?: string) =>
              `<span data-lang="${lang}">${code}</span>`,
          }),
      ),
    )
    expect(html).toContain('<span data-lang="ts">const x = 1</span>')
  })
})
