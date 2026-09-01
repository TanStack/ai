/** @vitest-environment node */
import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import Automatic from './fixtures/automatic.svelte'
import Manual from './fixtures/manual.svelte'
import Queue from './fixtures/queue.svelte'
import { cancelled } from './fixtures/queue-data'

describe('Svelte createChatUI', () => {
  it('renders automatic and snippet traversal', () => {
    expect(render(Automatic).body).toContain('<strong>Paris</strong>')
    expect(render(Manual).body).toContain('<span>1</span>')
  })

  it('renders each queued item and binds cancelQueued', () => {
    expect(render(Queue).body).toContain('<em>later</em>')
    expect(cancelled).toEqual(['q1'])
  })
})
