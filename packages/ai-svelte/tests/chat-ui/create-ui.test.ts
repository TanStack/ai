/** @vitest-environment node */
import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import Automatic from './fixtures/automatic.svelte'

describe('Svelte Chat', () => {
  it('renders mapped tools from chat.messages', () => {
    expect(render(Automatic).body).toContain('<strong>Paris</strong>')
  })
})
