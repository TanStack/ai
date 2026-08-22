import { describe, expect, it } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { createMockConnectionAdapter, createTextChunks } from './test-utils'

describe('ChatClient stream processing', () => {
  it('does not wait for a macrotask after each live chunk', async () => {
    const client = new ChatClient({
      connection: createMockConnectionAdapter({
        chunks: createTextChunks('ab'),
      }),
    })
    let macrotaskRan = false
    setTimeout(() => {
      macrotaskRan = true
    }, 0)

    await client.sendMessage('Hi')

    expect(macrotaskRan).toBe(false)
  })
})
