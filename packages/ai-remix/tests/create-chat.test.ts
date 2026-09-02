import { EventType } from '@tanstack/ai/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChat } from '../src/create-chat'
import type { Handle } from 'remix/ui'
import type { StreamChunk } from '@tanstack/ai/client'

const abortControllers: Array<AbortController> = []

afterEach(() => {
  for (const abort of abortControllers) {
    abort.abort()
  }
  abortControllers.length = 0
  vi.restoreAllMocks()
})

function createHandle() {
  const abort = new AbortController()
  abortControllers.push(abort)
  const frame = Object.assign(new EventTarget(), {
    src: '',
    reload: async () => abort.signal,
    replace: async () => {},
  })
  const handle: Handle = {
    id: 'handle-1',
    update: vi.fn(async () => abort.signal),
    signal: abort.signal,
    props: {},
    context: {
      set() {},
      get() {
        return undefined
      },
    },
    queueTask() {},
    frame,
    frames: {
      top: frame,
      get() {
        return undefined
      },
    },
  }
  return { handle, abort }
}

function textChunk(delta: string, messageId = 'assistant-1'): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    timestamp: Date.now(),
    delta,
  }
}

function runFinished(runId = 'run-1'): StreamChunk {
  return {
    type: EventType.RUN_FINISHED,
    runId,
    threadId: 'thread-1',
    timestamp: Date.now(),
  }
}

function createConnection(chunks: Array<StreamChunk>) {
  return {
    async *connect() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

describe('createChat', () => {
  it('records user and assistant messages and calls handle.update after sendMessage', async () => {
    const { handle } = createHandle()
    const chat = createChat(handle, {
      connection: createConnection([textChunk('Hi'), runFinished()]),
    })

    await chat.sendMessage('Hello')

    expect(chat.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ])
    expect(handle.update).toHaveBeenCalled()
  })

  it('does not call handle.update after the handle signal aborts', async () => {
    const { handle, abort } = createHandle()
    const chat = createChat(handle, {
      connection: createConnection([textChunk('Hi'), runFinished()]),
    })

    vi.mocked(handle.update).mockClear()
    abort.abort()

    await chat.sendMessage('Hello').catch(() => {})

    expect(handle.update).not.toHaveBeenCalled()
  })
})
