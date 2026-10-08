// Regression coverage for the shipping default. The suite-wide setup file
// (`use-real-devtools-bridges.ts`) re-routes the no-op devtools factories to
// the real bridges, so no other test exercises the bridge production
// consumers actually get when they don't opt into devtools. Unmock here so
// `ChatClient` runs against the actual no-op bridge that ships as the
// default, instead of the real-bridge substitute the setup file installs.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiEventClient } from '@tanstack/ai-event-client'
import { ChatClient } from '../src/chat-client'
import { createChatDevtoolsBridge } from '../src/devtools'
import { createMockConnectionAdapter, createTextChunks } from './test-utils'

vi.unmock('../src/devtools-noop')

describe('createChatDevtoolsBridge by NODE_ENV', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  async function streamWithRealFactory() {
    const emit = vi.spyOn(aiEventClient, 'emit')
    const client = new ChatClient({
      connection: createMockConnectionAdapter({
        chunks: createTextChunks('Hi there'),
      }),
      devtoolsBridgeFactory: createChatDevtoolsBridge,
    })
    await client.sendMessage('hello')
    return emit
  }

  it('emits no devtools events in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(await streamWithRealFactory()).not.toHaveBeenCalled()
  })

  it('emits devtools events in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(await streamWithRealFactory()).toHaveBeenCalled()
  })
})

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
