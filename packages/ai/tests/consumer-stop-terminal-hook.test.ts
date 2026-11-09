import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { fakeText } from '../src/testing'
import { EventType } from '../src/types'
import { clientTool, createMockAdapter, ev, serverTool } from './test-utils'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { StreamChunk, Tool } from '../src/types'

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

function runWithTool(middleware: ChatMiddleware, tool: Tool) {
  const { adapter, calls } = createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.toolStart('call-1', tool.name),
        ev.toolArgs('call-1', '{}'),
        ev.runFinished('tool_calls'),
      ],
      [
        ev.runStarted('run-2'),
        ev.textStart(),
        ev.textContent('done'),
        ev.textEnd(),
        ev.runFinished('stop', 'run-2'),
      ],
    ],
  })
  const stream = chat({
    threadId: 'thread-1',
    adapter,
    messages: [{ role: 'user', content: 'Use the tool' }],
    tools: [tool],
    middleware: [middleware],
  }) as AsyncIterable<StreamChunk>
  return { stream, calls }
}

describe('a consumer that stops iterating chat() runs one terminal hook', () => {
  it('break after the first TEXT_MESSAGE_CONTENT runs onAbort', async () => {
    const { hooks, middleware } = terminalRecorder()
    for await (const chunk of run(middleware)) {
      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) break
    }
    expect(hooks).toEqual(['onAbort'])
  })

  it('break after the final RUN_FINISHED runs onAbort', async () => {
    const { hooks, middleware } = terminalRecorder()
    for await (const chunk of run(middleware)) {
      if (chunk.type === EventType.RUN_FINISHED) break
    }
    expect(hooks).toEqual(['onAbort'])
  })

  it('break after a tool turn RUN_FINISHED runs onAbort and no next turn', async () => {
    const { hooks, middleware } = terminalRecorder()
    const { stream, calls } = runWithTool(
      middleware,
      serverTool('lookup', () => 'found'),
    )
    for await (const chunk of stream) {
      if (chunk.type === EventType.RUN_FINISHED) break
    }
    expect(hooks).toEqual(['onAbort'])
    expect(calls).toHaveLength(1)
  })

  it.each([
    ['a client tool', clientTool('ask_client')],
    [
      'an approval',
      { ...serverTool('delete_file', () => 'deleted'), needsApproval: true },
    ],
  ])(
    'break after %s pause RUN_FINISHED runs onFinish',
    async (_kind, tool) => {
      const { hooks, middleware } = terminalRecorder()
      const { stream, calls } = runWithTool(middleware, tool)
      let stoppedAt: StreamChunk | undefined
      for await (const chunk of stream) {
        if (chunk.type === EventType.RUN_FINISHED) {
          stoppedAt = chunk
          break
        }
      }
      expect(stoppedAt).toMatchObject({ outcome: { type: 'interrupt' } })
      expect(hooks).toEqual(['onFinish'])
      expect(calls).toHaveLength(1)
    },
  )

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
