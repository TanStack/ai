import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { createTextChunks } from './test-utils'
import type { StreamChunk } from '@tanstack/ai'
import type { ChatFetcher, UIMessage } from '../src/types'

/**
 * Tests for the `fetcher` transport on ChatClient — the chat-side mirror of
 * `GenerationFetcher` (used by useGenerateSpeech / useSummarize / etc.).
 */
describe('ChatClient — fetcher transport', () => {
  it('runs an in-process AsyncIterable fetcher and streams text', async () => {
    const chunks = createTextChunks('Hello world', 'msg-1')
    const fetcher = vi.fn<ChatFetcher>(async function* () {
      for (const chunk of chunks) {
        yield chunk
      }
    } as unknown as ChatFetcher)

    let finalMessages: Array<UIMessage> = []
    const client = new ChatClient({
      fetcher,
      onMessagesChange: (m) => {
        finalMessages = m
      },
    })

    await client.sendMessage('Hi')

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(finalMessages).toHaveLength(2) // user + assistant
    const assistant = finalMessages[1]!
    expect(assistant.role).toBe('assistant')
    const textPart = assistant.parts.find((p) => p.type === 'text')
    expect(textPart && 'content' in textPart && textPart.content).toBe(
      'Hello world',
    )
  })

  it('parses an SSE Response returned by the fetcher (server-fn style)', async () => {
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

    const fetcher = vi.fn<ChatFetcher>(async () => {
      return new Response(sseBody, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    })

    let finalMessages: Array<UIMessage> = []
    const client = new ChatClient({
      fetcher,
      onMessagesChange: (m) => {
        finalMessages = m
      },
    })

    await client.sendMessage('hi')

    expect(fetcher).toHaveBeenCalledTimes(1)
    const assistant = finalMessages[1]!
    expect(assistant.role).toBe('assistant')
    const textPart = assistant.parts.find((p) => p.type === 'text')
    expect(textPart && 'content' in textPart && textPart.content).toBe('Hi')
  })

  it('passes the AbortSignal to the fetcher; stop() aborts it', async () => {
    let observedSignal: AbortSignal | undefined
    let resolveFetcher: (() => void) | undefined
    const fetcherStarted = new Promise<void>((res) => {
      resolveFetcher = res
    })

    const fetcher: ChatFetcher = async (_input, { signal }) => {
      observedSignal = signal
      resolveFetcher?.()
      // Hang until aborted
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      })
    }

    const client = new ChatClient({ fetcher })
    const sendPromise = client.sendMessage('hi')
    await fetcherStarted
    expect(observedSignal).toBeDefined()
    expect(observedSignal!.aborted).toBe(false)

    client.stop()
    await sendPromise
    expect(observedSignal!.aborted).toBe(true)
  })

  it('surfaces a fetcher error as a ChatClient error', async () => {
    const fetcher: ChatFetcher = async () => {
      throw new Error('fetcher exploded')
    }
    let observedError: Error | undefined
    const client = new ChatClient({
      fetcher,
      onError: (err) => {
        observedError = err
      },
    })

    await client.sendMessage('hi')

    expect(observedError).toBeDefined()
    expect(observedError!.message).toBe('fetcher exploded')
    expect(client.getStatus()).toBe('error')
  })

  it('surfaces a malformed-SSE Response as a ChatClient error', async () => {
    // A fetcher that returns a Response whose body has a malformed JSON line.
    // The new behavior is to throw SyntaxError from the SSE parser; the
    // chat client should surface that as an error rather than silently
    // dropping the bad chunk.
    const sseBody = 'data: { not valid json\n\n'
    const fetcher: ChatFetcher = async () => {
      return new Response(sseBody, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }

    let observedError: Error | undefined
    const client = new ChatClient({
      fetcher,
      onError: (err) => {
        observedError = err
      },
    })

    await client.sendMessage('hi')

    expect(observedError).toBeDefined()
    expect(observedError!.name).toBe('SyntaxError')
    expect(client.getStatus()).toBe('error')
  })

  it('passes UIMessages and merged body to the fetcher', async () => {
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

    const client = new ChatClient({
      fetcher,
      body: { provider: 'openai' },
    })

    await client.sendMessage('hello there')

    expect(fetcher).toHaveBeenCalledTimes(1)
    const [input] = fetcher.mock.calls[0]!
    expect(input.messages).toHaveLength(1)
    expect(input.messages[0]!.role).toBe('user')
    expect(input.messages[0]!.parts[0]).toMatchObject({
      type: 'text',
      content: 'hello there',
    })
    expect(input.data).toMatchObject({
      provider: 'openai',
      conversationId: expect.any(String),
    })
  })

  it('throws when both connection and fetcher are passed', () => {
    // The XOR is enforced at the type level via `ChatTransport`; the runtime
    // check is defense-in-depth for callers using `as any` / dynamic options.
    const both: any = {
      connection: { connect: async function* () {} },
      fetcher: async () => new Response(''),
    }
    expect(() => new ChatClient(both)).toThrow(
      'pass either `connection` or `fetcher`',
    )
  })

  it('throws when neither connection nor fetcher is passed', () => {
    expect(() => new ChatClient({} as any)).toThrow(
      'either `connection` or `fetcher` is required',
    )
  })

  it('surfaces a non-OK Response as a ChatClient error', async () => {
    const fetcher: ChatFetcher = async () =>
      new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      })

    let observedError: Error | undefined
    const client = new ChatClient({
      fetcher,
      onError: (err) => {
        observedError = err
      },
    })

    await client.sendMessage('hi')

    expect(observedError).toBeDefined()
    expect(observedError!.message).toMatch(/HTTP error.*500/)
    expect(client.getStatus()).toBe('error')
  })

  it('surfaces an AsyncIterable that throws after yielding chunks', async () => {
    const fetcher = vi.fn<ChatFetcher>(async function* () {
      yield {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'm1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'partial',
        content: 'partial',
      } as StreamChunk
      throw new Error('mid-stream boom')
    } as unknown as ChatFetcher)

    let observedError: Error | undefined
    const client = new ChatClient({
      fetcher,
      onError: (err) => {
        observedError = err
      },
    })

    await client.sendMessage('hi')

    expect(observedError).toBeDefined()
    expect(observedError!.message).toBe('mid-stream boom')
    expect(client.getStatus()).toBe('error')
  })

  it('completes cleanly when AsyncIterable ends without RUN_FINISHED', async () => {
    const fetcher = vi.fn<ChatFetcher>(async function* () {
      yield {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'm1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
      } as StreamChunk
    } as unknown as ChatFetcher)

    let finalMessages: Array<UIMessage> = []
    const client = new ChatClient({
      fetcher,
      onMessagesChange: (m) => {
        finalMessages = m
      },
    })

    await client.sendMessage('hi')

    expect(client.getStatus()).toBe('ready')
    expect(finalMessages).toHaveLength(2)
    const assistant = finalMessages[1]!
    const textPart = assistant.parts.find((p) => p.type === 'text')
    expect(textPart && 'content' in textPart && textPart.content).toBe('Hello')
  })

  it('stops consuming chunks from an AsyncIterable that ignores its signal', async () => {
    const observedChunks: Array<StreamChunk> = []
    const fetcher: ChatFetcher = async () => {
      return (async function* () {
        await new Promise((r) => setTimeout(r, 5))
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 20))
          yield {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: 'm1',
            model: 'test',
            timestamp: Date.now(),
            delta: String(i),
            content: String(i),
          } as StreamChunk
        }
      })()
    }

    const client = new ChatClient({
      fetcher,
      onChunk: (c) => observedChunks.push(c),
    })
    const sendPromise = client.sendMessage('hi')
    await new Promise((r) => setTimeout(r, 30))
    const beforeStop = observedChunks.length
    client.stop()
    await sendPromise
    await new Promise((r) => setTimeout(r, 100))

    expect(observedChunks.length).toBe(beforeStop)
  })
})
