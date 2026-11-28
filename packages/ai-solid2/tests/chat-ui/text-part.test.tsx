import { createSignal, flush } from 'solid-js'
import { render } from '@solidjs/web'
import { afterEach, describe, expect, it } from 'vitest'

import * as module from '../../src/chat-ui/text-part'
const disposers: Array<() => void> = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

function textPart() {
  expect(module?.TextPart).toBeTypeOf('function')
  return module!.TextPart
}

function mount(node: Parameters<typeof render>[0]) {
  const container = document.createElement('div')
  disposers.push(render(node, container))
  flush()
  return container
}

describe('Solid 2 TextPart', () => {
  it('renders markdown and escapes raw HTML', () => {
    const TextPart = textPart()
    const container = mount(() => (
      <TextPart
        role="user"
        class="base"
        userClass="user"
        content={'**bold** <script>alert(1)</script>'}
      />
    ))
    expect(container.innerHTML).toContain('class="base user"')
    expect(container.innerHTML).toContain('<strong>bold</strong>')
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).toContain('&lt;script&gt;')
  })

  it('removes executable URLs and escapes event-handler HTML', () => {
    const TextPart = textPart()
    const container = mount(() => (
      <TextPart
        content={
          '[unsafe](javascript:alert%281%29)\n\n![unsafe](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>\n\n[safe](https://example.com)'
        }
      />
    ))
    expect(container.querySelector('[onerror]')).toBeNull()
    expect(
      container.querySelector('[href^="javascript:"], [src^="javascript:"]'),
    ).toBeNull()
    expect(
      container.querySelector('a[href="https://example.com"]'),
    ).not.toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('applies a custom highlighter to fenced code', () => {
    const TextPart = textPart()
    const container = mount(() => (
      <TextPart
        content={'```ts\nconst x = 1\n```'}
        highlighter={(code, lang) => `<span data-lang="${lang}">${code}</span>`}
      />
    ))
    expect(container.innerHTML).toContain(
      '<span data-lang="ts">const x = 1</span>',
    )
  })

  it('keeps partial code verbatim at every character boundary', () => {
    const TextPart = textPart()
    const full =
      '```json\n{ name: "john", age: 3 }\n```\n\nInline `{ name: "john" }`.'
    const [content, setContent] = createSignal('')
    const container = mount(() => <TextPart content={content()} />)
    for (let i = 1; i <= full.length; i++) {
      const src = full.slice(0, i)
      setContent(src)
      flush()
      const partial = src.match(/\{ name: "[a-z"]*/)?.[0]
      if (partial) expect(container.textContent).toContain(partial)
    }
  })

  it('tracks content, role, and class prop changes', () => {
    const TextPart = textPart()
    const [content, setContent] = createSignal('**first**')
    const [role, setRole] = createSignal<'user' | 'assistant'>('user')
    const [className, setClassName] = createSignal('base')
    const container = mount(() => (
      <TextPart
        content={content()}
        role={role()}
        class={className()}
        userClass="user"
        assistantClass="assistant"
      />
    ))
    expect(container.firstElementChild?.className).toBe('base user')
    setContent('*second*')
    setRole('assistant')
    setClassName('updated')
    flush()
    expect(container.querySelector('strong')).toBeNull()
    expect(container.querySelector('em')?.textContent).toBe('second')
    expect(container.firstElementChild?.className).toBe('updated assistant')
  })
})
