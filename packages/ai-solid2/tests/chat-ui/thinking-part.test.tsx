import { createSignal, flush } from 'solid-js'
import { render } from '@solidjs/web'
import { afterEach, describe, expect, it } from 'vitest'

import * as module from '../../src/chat-ui/thinking-part'
const disposers: Array<() => void> = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

function thinkingPart() {
  expect(module?.ThinkingPart).toBeTypeOf('function')
  return module!.ThinkingPart
}

function mount(node: Parameters<typeof render>[0]) {
  const container = document.createElement('div')
  disposers.push(render(node, container))
  flush()
  return container
}

describe('Solid 2 ThinkingPart', () => {
  it('updates reasoning and auto-collapses when it completes', () => {
    const ThinkingPart = thinkingPart()
    const [content, setContent] = createSignal('first thought')
    const [complete, setComplete] = createSignal(false)
    const container = mount(() => (
      <ThinkingPart content={content()} isComplete={complete()} />
    ))
    expect(container.textContent).toContain('first thought')
    expect(
      container.querySelector('button')?.getAttribute('aria-expanded'),
    ).toBe('true')
    setContent('second thought')
    flush()
    expect(container.textContent).toContain('second thought')
    setComplete(true)
    flush()
    expect(container.textContent).not.toContain('second thought')
    expect(container.textContent).toContain('(complete)')
    expect(
      container.querySelector('button')?.getAttribute('aria-expanded'),
    ).toBe('false')
    container.querySelector('button')!.click()
    flush()
    expect(container.textContent).toContain('second thought')
  })

  it('starts collapsed when complete and permits manual toggles', () => {
    const ThinkingPart = thinkingPart()
    const container = mount(() => (
      <ThinkingPart content="finished" isComplete class="reasoning" />
    ))
    expect(
      container.querySelector('[data-part-type="thinking"]')?.className,
    ).toBe('reasoning')
    expect(container.textContent).not.toContain('finished')
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('Expand thinking')
    button.click()
    flush()
    expect(container.textContent).toContain('finished')
    button.click()
    flush()
    expect(container.textContent).not.toContain('finished')
  })

  it('keeps a manually collapsed thought closed when completion resets', () => {
    const ThinkingPart = thinkingPart()
    const [complete, setComplete] = createSignal(false)
    const container = mount(() => (
      <ThinkingPart content="thought" isComplete={complete()} />
    ))
    container.querySelector('button')!.click()
    flush()
    setComplete(true)
    flush()
    setComplete(false)
    flush()
    expect(
      container.querySelector('button')?.getAttribute('aria-expanded'),
    ).toBe('false')
    expect(container.textContent).not.toContain('(complete)')
  })
})
