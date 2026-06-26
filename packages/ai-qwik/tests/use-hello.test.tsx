import { createDOM } from '@qwik.dev/core/testing'
import { component$ } from '@qwik.dev/core'
import { describe, expect, test } from 'vitest'
import { createAiQwikHelloMessage, useAiQwikHello } from '../src'

const HelloHarness = component$(() => {
  const hello = useAiQwikHello('tests')

  return (
    <section data-testid="ai-qwik-hello">
      <h2>{hello.message}</h2>
      <button type="button" onClick$={() => hello.count.value++}>
        Count {hello.count.value}
      </button>
    </section>
  )
})

describe('@tanstack/ai-qwik hello scaffold', () => {
  test('creates a hello message', () => {
    expect(createAiQwikHelloMessage('tester')).toBe(
      'Hello tester from TanStack AI Qwik',
    )
  })

  test('uses the hello hook inside a Qwik component', async () => {
    const { screen, render } = await createDOM()

    await render(<HelloHarness />)

    expect(screen.outerHTML).toContain('Hello tests from TanStack AI Qwik')
  })
})
