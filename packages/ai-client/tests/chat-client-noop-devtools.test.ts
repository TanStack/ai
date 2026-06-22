// Regression coverage for the shipping default. The suite-wide setup file
// (`use-real-devtools-bridges.ts`) re-routes the no-op devtools factories to
// the real bridges, so no other test exercises the bridge production
// consumers actually get when they don't opt into devtools. Unmock here so
// `ChatClient` runs against the actual no-op bridge that ships as the
// default, instead of the real-bridge substitute the setup file installs.
import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { createMockConnectionAdapter, createTextChunks } from './test-utils'

vi.unmock('../src/devtools-noop')

describe('ChatClient with default no-op devtools bridge', () => {
  it('sends the first message and appends it', async () => {
    const adapter = createMockConnectionAdapter({
      chunks: createTextChunks('Hi there'),
    })
    const client = new ChatClient({ connection: adapter })

    await client.sendMessage('hello')

    const messages = client.getMessages()
    expect(messages.at(0)?.role).toBe('user')
    expect(messages.at(0)?.parts).toEqual([{ type: 'text', content: 'hello' }])
    expect(messages.at(1)?.role).toBe('assistant')
  })

  it('updates tools without throwing', () => {
    const adapter = createMockConnectionAdapter()
    const client = new ChatClient({ connection: adapter })

    expect(() => client.updateOptions({ tools: [] })).not.toThrow()
  })
})
