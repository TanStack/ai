import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import Automatic from './fixtures/automatic.svelte'
import Manual from './fixtures/manual.svelte'

describe('Svelte createUI', () => {
  it('renders automatic and snippet traversal', () => {
    expect(render(Automatic).body).toContain('<strong>Paris</strong>')
    expect(render(Manual).body).toContain('<span>1</span>')
  })
})
