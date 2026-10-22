import { renderHook } from '@octanejs/testing-library'
import { EventType } from '@tanstack/ai'
import { defineByok, memoryStorage } from '@tanstack/ai-client/byok'
import { describe, expect, it } from 'vitest'
import { useChat } from '../../src/use-chat.tsrx'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '@tanstack/ai-client'

const RAW_KEY = 'sk-live-secret'

describe('useChat byok', () => {
  it('stamps x-byok headers and keeps the key out of the body', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('openai', RAW_KEY)
    const record: {
      headers?: Record<string, string>
      data?: Record<string, unknown>
    } = {}
    const connection: ConnectConnectionAdapter = {
      async *connect(
        _messages,
        data?: Record<string, unknown>,
        _abortSignal?: AbortSignal,
        runContext?: RunAgentInputContext,
      ) {
        record.headers = runContext?.headers
        record.data = data
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          model: 'gpt-5.5',
          timestamp: Date.now(),
          finishReason: 'stop',
        }
      },
    }

    const { result } = renderHook(() =>
      useChat({
        threadId: 'thread-1',
        connection,
        byok,
        forwardedProps: { provider: 'openai', model: 'gpt-5.5' },
      }),
    )

    await result.current.sendMessage('Hello')

    expect(record.headers).toEqual({ 'x-byok-openai': RAW_KEY })
    expect(JSON.stringify(record.data)).not.toContain(RAW_KEY)
  })
})
