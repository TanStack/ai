import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { fakeText } from '../src/testing'
import { EventType } from '../src/types'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { StreamChunk } from '../src/types'

function terminalRecorder() {
  const hooks: Array<string> = []
  const middleware: ChatMiddleware = {
    name: 'record-terminal',
    onFinish: () => {
      hooks.push('onFinish')
    },
    onAbort: () => {
      hooks.push('onAbort')
    },
    onError: () => {
      hooks.push('onError')
    },
  }
  return { hooks, middleware }
}

function run(middleware: ChatMiddleware) {
  const adapter = fakeText()
  adapter.setResponses([{ text: 'a long answer in many chunks' }])
  return chat({
    threadId: 'thread-1',
    adapter,
    messages: [{ role: 'user', content: 'Hi' }],
    middleware: [middleware],
  }) as AsyncIterable<StreamChunk>
}

describe('a consumer that stops iterating chat() runs one terminal hook', () => {
  it('break after the first TEXT_MESSAGE_CONTENT runs onAbort', async () => {
    const { hooks, middleware } = terminalRecorder()
    for await (const chunk of run(middleware)) {
      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) break
    }
    expect(hooks).toEqual(['onAbort'])
  })

  it('break after RUN_FINISHED runs one terminal hook', async () => {
    const { hooks, middleware } = terminalRecorder()
    for await (const chunk of run(middleware)) {
      if (chunk.type === EventType.RUN_FINISHED) break
    }
    expect(hooks).toHaveLength(1)
  })

  it('return() after the first TEXT_MESSAGE_CONTENT runs onAbort', async () => {
    const { hooks, middleware } = terminalRecorder()
    const iterator = run(middleware)[Symbol.asyncIterator]()
    let next = await iterator.next()
    while (!next.done && next.value.type !== EventType.TEXT_MESSAGE_CONTENT) {
      next = await iterator.next()
    }
    await iterator.return?.()
    expect(hooks).toEqual(['onAbort'])
  })

  it('a full drain runs onFinish once', async () => {
    const { hooks, middleware } = terminalRecorder()
    for await (const _ of run(middleware)) {
      // drain
    }
    expect(hooks).toEqual(['onFinish'])
  })
})
