import { EventType } from '@tanstack/ai'
import { defineByok, memoryStorage } from '@tanstack/ai-client/byok'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useChat } from '../src/use-chat'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '@tanstack/ai-client'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { UIMessage } from '../src/types'

const RAW_KEY = 'sk-live-secret'

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
  return { connect }
}

describe('useChat byok', () => {
  it('stamps x-byok headers and keeps the key out of the body', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('openai', RAW_KEY)
    const record: {
      headers?: Record<string, string>
      data?: Record<string, unknown>
    } = {}

    const { result } = renderHook(() =>
      useChat({
        connection: recordingConnection(record),
        byok,
        forwardedProps: { provider: 'openai', model: 'gpt-5.5' },
      }),
    )

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    expect(record.headers).toEqual({ 'x-byok-openai': RAW_KEY })
    expect(record.data).toEqual({ provider: 'openai', model: 'gpt-5.5' })
    expect(JSON.stringify(record.data)).not.toContain(RAW_KEY)
  })

  it('uses the latest byokProvider after a rerender', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('openai', RAW_KEY)
    await byok.update('anthropic', 'sk-anthropic-secret')
    const record: {
      headers?: Record<string, string>
      data?: Record<string, unknown>
    } = {}

    const { result, rerender } = renderHook(
      ({ provider }: { provider: 'openai' | 'anthropic' }) =>
        useChat({
          connection: recordingConnection(record),
          byok,
          byokProvider: () => provider,
        }),
      { initialProps: { provider: 'openai' as 'openai' | 'anthropic' } },
    )

    rerender({ provider: 'anthropic' })

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    expect(record.headers).toEqual({
      'x-byok-anthropic': 'sk-anthropic-secret',
    })
  })
})
