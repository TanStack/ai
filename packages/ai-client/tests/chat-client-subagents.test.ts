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
})
