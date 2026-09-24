import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import { createMockConnectionAdapter } from './test-utils'
import type { StreamChunk } from '@tanstack/ai/client'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'

const now = () => Date.now()

function runStarted(): StreamChunk {
  return {
    type: EventType.RUN_STARTED,
    runId: 'run-1',
    threadId: 'thread-1',
    timestamp: now(),
  }
}

function runFinished(): StreamChunk {
  return {
    type: EventType.RUN_FINISHED,
    runId: 'run-1',
    threadId: 'thread-1',
    timestamp: now(),
  }
}

function subagentStarted(): StreamChunk {
  return {
    type: EventType.SUBAGENT_STARTED,
    subagentRunId: 'sub-1',
    name: 'researcher',
    timestamp: now(),
  }
}

function subagentFinished(): StreamChunk {
  return {
    type: EventType.SUBAGENT_FINISHED,
    subagentRunId: 'sub-1',
    timestamp: now(),
  }
}

function childTextStart(): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'child-msg',
    role: 'assistant',
    timestamp: now(),
    subagentRunId: 'sub-1',
  }
}

function childTextContent(delta: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'child-msg',
    delta,
    timestamp: now(),
    subagentRunId: 'sub-1',
  }
}

describe('ChatClient subagents', () => {
  it('keeps useChat.subagents and part.subagent as the same object with stop', async () => {
    const chunks: Array<StreamChunk> = [
      runStarted(),
      subagentStarted(),
      childTextStart(),
      childTextContent('Hello'),
      subagentFinished(),
      runFinished(),
    ]

    const client = new ChatClient({
      connection: createMockConnectionAdapter({ chunks }),
    })
    await client.sendMessage('hi')

    const assistant = client
      .getMessages()
      .find((message) => message.role === 'assistant')
    const part = assistant?.parts.find((entry) => entry.type === 'subagent')
    const subagents = client.getSubagents()

    expect(part?.type).toBe('subagent')
    if (part?.type !== 'subagent') throw new Error('expected subagent part')
    expect(subagents).toHaveLength(1)
    expect(subagents[0]).toBe(part.subagent)
    expect(typeof part.subagent.stop).toBe('function')
    expect(typeof subagents[0]?.stop).toBe('function')
    expect(part.subagent.stop).toBe(subagents[0]?.stop)
  })

  it('keeps status error after stop when SUBAGENT_FINISHED arrives later', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const connection: ConnectConnectionAdapter = {
      async *connect(_messages, _data, abortSignal) {
        yield runStarted()
        yield subagentStarted()
        await gate
        if (abortSignal?.aborted) return
        yield childTextStart()
        yield childTextContent('late')
        yield subagentFinished()
        yield runFinished()
      },
    }

    const client = new ChatClient({ connection })
    const sendPromise = client.sendMessage('hi')
    await vi.waitFor(() => {
      expect(client.getSubagents()).toHaveLength(1)
    })

    const handle = client.getSubagents()[0]
    const assistant = client
      .getMessages()
      .find((message) => message.role === 'assistant')
    const part = assistant?.parts.find((entry) => entry.type === 'subagent')
    expect(part?.type).toBe('subagent')
    if (part?.type !== 'subagent') throw new Error('expected subagent part')
    expect(handle).toBe(part.subagent)
    handle?.stop?.()
    expect(handle?.status).toBe('error')
    expect(handle?.error).toEqual({ message: 'Stopped' })

    release()
    await sendPromise

    expect(handle).toBe(part.subagent)
    expect(handle?.status).toBe('error')
    expect(handle?.error).toEqual({ message: 'Stopped' })
    expect(part.subagent.status).toBe('error')
    expect(handle?.messages).toEqual([])
  })

  it('aborts a hanging child on stop so no later child text arrives', async () => {
    let connectAbort: AbortSignal | undefined
    const connection: ConnectConnectionAdapter = {
      async *connect(_messages, _data, abortSignal) {
        connectAbort = abortSignal
        yield runStarted()
        yield subagentStarted()
        yield childTextStart()
        yield childTextContent('partial')
        await new Promise<void>((resolve) => {
          if (abortSignal?.aborted) {
            resolve()
            return
          }
          abortSignal?.addEventListener('abort', () => resolve(), {
            once: true,
          })
        })
        if (!abortSignal?.aborted) {
          yield childTextContent('late')
          yield subagentFinished()
          yield runFinished()
        }
      },
    }

    const client = new ChatClient({ connection })
    const sendPromise = client.sendMessage('hi')
    await vi.waitFor(() => {
      const nested = client.getSubagents()[0]?.messages[0]?.parts
      expect(nested).toEqual([{ type: 'text', content: 'partial' }])
    })

    const handle = client.getSubagents()[0]
    const assistant = client
      .getMessages()
      .find((message) => message.role === 'assistant')
    const part = assistant?.parts.find((entry) => entry.type === 'subagent')
    expect(part?.type).toBe('subagent')
    if (part?.type !== 'subagent') throw new Error('expected subagent part')
    expect(handle).toBe(part.subagent)
    handle?.stop?.()

    expect(connectAbort?.aborted).toBe(true)
    await sendPromise

    expect(handle?.status).toBe('error')
    expect(handle?.error).toEqual({ message: 'Stopped' })
    expect(handle?.messages[0]?.parts).toEqual([
      { type: 'text', content: 'partial' },
    ])
  })

  it('lets a stopped child stream again when the server restarts it', async () => {
    let call = 0
    const connection: ConnectConnectionAdapter = {
      async *connect(_messages, _data, abortSignal) {
        call++
        yield runStarted()
        yield subagentStarted()
        if (call === 1) {
          yield childTextStart()
          yield childTextContent('partial')
          await new Promise<void>((resolve) => {
            abortSignal?.addEventListener('abort', () => resolve(), {
              once: true,
            })
          })
          return
        }
        yield childTextStart()
        yield childTextContent('again')
        yield subagentFinished()
        yield runFinished()
      },
    }

    const client = new ChatClient({ connection })
    const first = client.sendMessage('hi')
    await vi.waitFor(() => {
      expect(client.getSubagents()[0]?.messages[0]?.parts).toEqual([
        { type: 'text', content: 'partial' },
      ])
    })
    client.getSubagents()[0]?.stop?.()
    await first
    expect(client.getSubagents()[0]?.status).toBe('error')

    // The same child id starts again, as a resume does. Its chunks count.
    await client.sendMessage('go on')
    const handle = client.getSubagents().find((entry) => entry.id === 'sub-1')
    expect(handle?.status).toBe('finished')
    expect(handle?.messages[0]?.parts).toEqual([
      { type: 'text', content: 'again' },
    ])
  })
})

describe('ChatClient subagent handles for restored messages', () => {
  it('gives restored cards a handle, and drops it after clear()', () => {
    const client = new ChatClient({
      connection: createMockConnectionAdapter({ chunks: [] }),
      initialMessages: [
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            {
              type: 'subagent',
              subagent: {
                id: 'sub-restored',
                name: 'researcher',
                status: 'finished',
                messages: [],
              },
            },
          ],
        },
      ],
    })

    const [handle] = client.getSubagents()
    expect(handle).toMatchObject({ id: 'sub-restored', name: 'researcher' })
    expect(typeof handle?.stop).toBe('function')
    const part = client.getMessages()[0]?.parts[0]
    expect(part?.type === 'subagent' ? part.subagent : undefined).toBe(handle)

    client.clear()
    expect(client.getSubagents()).toEqual([])
  })

  it('gives a nested card a handle with stop', () => {
    const client = new ChatClient({
      connection: createMockConnectionAdapter({ chunks: [] }),
      initialMessages: [
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            {
              type: 'subagent',
              subagent: {
                id: 'sub-outer',
                name: 'researcher',
                status: 'finished',
                messages: [
                  {
                    id: 'c1',
                    role: 'assistant',
                    parts: [
                      {
                        type: 'subagent',
                        subagent: {
                          id: 'sub-inner',
                          name: 'fetcher',
                          status: 'finished',
                          messages: [],
                        },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    const ids = client.getSubagents().map((handle) => handle.id)
    expect(ids).toEqual(['sub-outer', 'sub-inner'])
    const inner = client.getSubagents().find((h) => h.id === 'sub-inner')
    expect(typeof inner?.stop).toBe('function')
    const outer = client.getMessages()[0]?.parts[0]
    const nested =
      outer?.type === 'subagent'
        ? outer.subagent.messages[0]?.parts[0]
        : undefined
    expect(nested?.type === 'subagent' ? nested.subagent : undefined).toBe(
      inner,
    )
  })
})
