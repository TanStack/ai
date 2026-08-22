import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import {
  ByokBlockedError,
  ByokMissingError,
  ByokUnresolvedProviderError,
} from '@tanstack/ai/byok'
import { defineByok, memoryStorage } from '../src/byok'
import { ChatClient } from '../src/chat-client'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '../src/connection-adapters'
import type { ModelMessage, StreamChunk } from '@tanstack/ai/client'
import type { ChatClientPersistence, UIMessage } from '../src/types'

const OPENAI_KEY = 'sk-live-secret'

function runFinished(): StreamChunk {
  return {
    type: EventType.RUN_FINISHED,
    runId: 'run-1',
    threadId: 'thread-1',
    model: 'gpt-5.5',
    timestamp: Date.now(),
    finishReason: 'stop',
  }
}

function recordingConnection(record: {
  headers?: Record<string, string>
  data?: Record<string, unknown>
  connect?: ReturnType<typeof vi.fn>
}): ConnectConnectionAdapter {
  const connect = vi.fn(async function* (
    _messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, unknown>,
    _abortSignal?: AbortSignal,
    runContext?: RunAgentInputContext,
  ) {
    record.headers = runContext?.headers
    record.data = data
    yield runFinished()
  })
  record.connect = connect
  return { connect }
}

describe('ChatClient byok', () => {
  it('stamps x-byok headers and keeps the key out of the body', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('openai', OPENAI_KEY)
    const record: {
      headers?: Record<string, string>
      data?: Record<string, unknown>
    } = {}
    const client = new ChatClient({
      connection: recordingConnection(record),
      byok,
      forwardedProps: { provider: 'openai', model: 'gpt-5.5' },
    })

    await client.sendMessage('Hello')

    expect(record.headers).toEqual({ 'x-byok-openai': OPENAI_KEY })
    expect(record.data).toEqual({ provider: 'openai', model: 'gpt-5.5' })
    expect(JSON.stringify(record.data)).not.toContain(OPENAI_KEY)
  })

  it('stamps only the resolved provider when the ring has multiple keys', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('openai', OPENAI_KEY)
    await byok.update('anthropic', 'sk-anthropic-secret')
    const record: {
      headers?: Record<string, string>
      data?: Record<string, unknown>
    } = {}
    const client = new ChatClient({
      connection: recordingConnection(record),
      byok,
      forwardedProps: { provider: 'openai', model: 'gpt-5.5' },
    })

    await client.sendMessage('Hello')

    expect(record.headers).toEqual({ 'x-byok-openai': OPENAI_KEY })
    expect(record.headers).not.toHaveProperty('x-byok-anthropic')
  })

  it('throws and does not connect when no provider slug resolves', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('openai', OPENAI_KEY)
    await byok.update('anthropic', 'sk-anthropic-secret')
    const record: {
      headers?: Record<string, string>
      connect?: ReturnType<typeof vi.fn>
    } = {}
    const client = new ChatClient({
      connection: recordingConnection(record),
      byok,
    })

    await expect(client.sendMessage('Hello')).rejects.toBeInstanceOf(
      ByokUnresolvedProviderError,
    )
    expect(record.connect).not.toHaveBeenCalled()
    expect(record.headers).toBeUndefined()
  })

  it('throws when forwardedProps.provider is not a slug', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('openai', OPENAI_KEY)
    const connect = vi.fn(async function* () {
      yield runFinished()
    })
    const client = new ChatClient({
      connection: { connect },
      byok,
      forwardedProps: { provider: 'OpenAI' },
    })

    await expect(client.sendMessage('Hello')).rejects.toBeInstanceOf(
      ByokUnresolvedProviderError,
    )
    expect(connect).not.toHaveBeenCalled()
  })

  it('stamps headers for slugs outside the old first-party list', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('bedrock', OPENAI_KEY)
    const record: {
      headers?: Record<string, string>
      data?: Record<string, unknown>
    } = {}
    const client = new ChatClient({
      connection: recordingConnection(record),
      byok,
      forwardedProps: { provider: 'bedrock', model: 'claude' },
    })

    await client.sendMessage('Hello')

    expect(record.headers).toEqual({ 'x-byok-bedrock': OPENAI_KEY })
  })

  it('rejects ByokBlockedError and does not connect when the provider is empty', async () => {
    const byok = defineByok()
    const connect = vi.fn(async function* () {
      yield runFinished()
    })
    const client = new ChatClient({
      connection: { connect },
      byok,
      forwardedProps: { provider: 'openai', model: 'gpt-5.5' },
    })

    await expect(client.sendMessage('Hello')).rejects.toBeInstanceOf(
      ByokBlockedError,
    )
    expect(byok.getSnapshot().prompt).toEqual({
      provider: 'openai',
      reason: 'missing',
    })
    expect(connect).not.toHaveBeenCalled()
  })

  it('rejects ByokMissingError from connect and sets the missing prompt', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('openai', OPENAI_KEY)
    const client = new ChatClient({
      connection: {
        async *connect() {
          throw new ByokMissingError('openai')
        },
      },
      byok,
      forwardedProps: { provider: 'openai', model: 'gpt-5.5' },
    })

    await expect(client.sendMessage('Hello')).rejects.toBeInstanceOf(
      ByokMissingError,
    )
    expect(byok.getSnapshot().prompt).toEqual({
      provider: 'openai',
      reason: 'missing',
    })
  })

  it('does not persist the raw key or x-byok headers', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('openai', OPENAI_KEY)
    const store = new Map<string, string>()
    const persistence: ChatClientPersistence = {
      getItem: (id) => {
        const raw = store.get(id)
        return raw === undefined ? null : JSON.parse(raw)
      },
      setItem: (id, state) => {
        store.set(id, JSON.stringify(state))
      },
      removeItem: (id) => {
        store.delete(id)
      },
    }
    const client = new ChatClient({
      connection: recordingConnection({}),
      byok,
      threadId: 'chat-1',
      persistence,
      forwardedProps: { provider: 'openai', model: 'gpt-5.5' },
    })

    await client.sendMessage('Hello')

    const stored = [...store.values()].join('\n')
    expect(stored.length).toBeGreaterThan(0)
    expect(stored).not.toContain(OPENAI_KEY)
    expect(stored).not.toContain('x-byok-')
  })
})
