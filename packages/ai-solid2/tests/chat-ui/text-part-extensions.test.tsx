import { flush } from 'solid-js'
import { render } from '@solidjs/web'
import { expect, it } from 'vitest'
import type { MarkdownExtension } from '@tanstack/markdown'
import { TextPart } from '../../src/chat-ui/text-part'

it('treats extension HTML as trusted, so extensions must escape untrusted text', () => {
  const content = '<img src=x onerror=alert(1)>'
  const container = document.createElement('div')
  const extensions: Array<MarkdownExtension> = [
    {
      name: 'escaped-source',
      renderHtml(node) {
        if (node.type !== 'paragraph') return
        const escaped = document.createElement('span')
        escaped.textContent = content
        return `<aside data-extension="trusted" onclick="void 0">${escaped.innerHTML}</aside>`
      },
    },
  ]
  const dispose = render(
    () => <TextPart content="extension placeholder" extensions={extensions} />,
    container,
  )
  try {
    flush()
    expect(
      container.querySelector('aside')?.getAttribute('data-extension'),
    ).toBe('trusted')
    // Even event-handler attributes from extensions are not sanitized.
    expect(container.querySelector('aside')?.getAttribute('onclick')).toBe(
      'void 0',
    )
    expect(container.querySelector('aside')?.textContent).toBe(content)
    expect(container.querySelector('img, [onerror]')).toBeNull()
  } finally {
    dispose()
  }
})
