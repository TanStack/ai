import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatFetcher } from '@tanstack/ai-client'
import type { StreamChunk } from '@tanstack/ai'
import { useChat } from '../src/use-chat'
import { createTextChunks } from './test-utils'

describe('useChat — fetcher transport', () => {
  it('streams text into messages via an AsyncIterable fetcher', async () => {
    const chunks = createTextChunks('Hello world', 'msg-1')
    const fetcher: ChatFetcher = async function* () {
      for (const chunk of chunks) {
        yield chunk
      }
    } as unknown as ChatFetcher

    const { result } = renderHook(() => useChat({ fetcher }))

    await result.current.sendMessage('hi')

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
    })
    const assistant = result.current.messages[1]!
    const textPart = assistant.parts.find((p) => p.type === 'text')
    expect(textPart && 'content' in textPart && textPart.content).toBe(
      'Hello world',
    )
  })

  it('parses an SSE Response returned by the fetcher', async () => {
    const sseBody =
      [
        `data: ${JSON.stringify({
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'm1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hi',
          content: 'Hi',
        })}`,
        `data: ${JSON.stringify({
          type: 'RUN_FINISHED',
          runId: 'r1',
          threadId: 't1',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        })}`,
        '',
      ].join('\n') + '\n'

    const fetcher: ChatFetcher = async () =>
      new Response(sseBody, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })

    const { result } = renderHook(() => useChat({ fetcher }))

    await result.current.sendMessage('hi')

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
    })
    const assistant = result.current.messages[1]!
    const textPart = assistant.parts.find((p) => p.type === 'text')
    expect(textPart && 'content' in textPart && textPart.content).toBe('Hi')
  })

  it('surfaces fetcher errors as the hook error state', async () => {
    const fetcher: ChatFetcher = async () => {
      throw new Error('boom')
    }

    const { result } = renderHook(() => useChat({ fetcher }))

    await result.current.sendMessage('hi')

    await waitFor(() => {
      expect(result.current.error).toBeDefined()
    })
    expect(result.current.error!.message).toBe('boom')
    expect(result.current.status).toBe('error')
  })

  it('passes the merged body and full message history to the fetcher', async () => {
    const fetcher = vi.fn<ChatFetcher>(async function* () {
      yield {
        type: 'RUN_FINISHED',
        runId: 'r1',
        threadId: 't1',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as StreamChunk
    } as unknown as ChatFetcher)

    const { result } = renderHook(() =>
      useChat({ fetcher, body: { provider: 'openai' } }),
    )

    await result.current.sendMessage('hello')

    expect(fetcher).toHaveBeenCalledTimes(1)
    const [input] = fetcher.mock.calls[0]!
    expect(input.messages).toHaveLength(1)
    expect(input.messages[0]!.role).toBe('user')
    expect(input.data).toMatchObject({ provider: 'openai' })
  })
})
