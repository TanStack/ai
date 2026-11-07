import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src'
import { executeToolCalls } from '../src/activities/chat/tools/tool-calls'
import { EventType } from '../src/types'

const then = Promise.prototype.then

afterEach(() => {
  Promise.prototype.then = then
  vi.useRealTimers()
})

it('does not subscribe to a pending tool execution on every event poll', async () => {
  vi.useFakeTimers()
  let finish: (value: string) => void = () => {}
  const slowTool = toolDefinition({
    name: 'slow',
    description: 'Finishes when the test says so',
    inputSchema: z.object({}),
  }).server(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  )
  const thenCallsByPromise = new Map<Promise<unknown>, number>()
  Promise.prototype.then = function (this: Promise<unknown>, ...args) {
    thenCallsByPromise.set(this, (thenCallsByPromise.get(this) ?? 0) + 1)
    return then.apply(this, args)
  } as typeof then

  const run = executeToolCalls(
    [
      {
        id: 'tc-slow',
        type: 'function',
        function: { name: slowTool.name, arguments: '{}' },
      },
    ],
    [slowTool],
    'thread-1',
  )
  const done = run.next()
  await vi.advanceTimersByTimeAsync(1_000)
  const mostThenCallsOnOnePromise = Math.max(...thenCallsByPromise.values())
  Promise.prototype.then = then

  finish('done')
  await vi.advanceTimersByTimeAsync(20)
  const result = await done

  expect(mostThenCallsOnOnePromise).toBeLessThan(5)
  expect(result.done).toBe(true)
  expect(result.value).toMatchObject({
    results: [{ toolCallId: 'tc-slow', result: 'done' }],
  })
})

it('yields an event emitted right before a polled tool rejects, then the error result', async () => {
  vi.useFakeTimers()
  const lateFailure = toolDefinition({
    name: 'late_failure',
    description: 'Emits an event, then fails after a few polls',
    inputSchema: z.object({}),
  }).server(async (_input, context) => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    context?.emitCustomEvent('late:progress', { step: 1 })
    throw new Error('late failure')
  })

  const run = executeToolCalls(
    [
      {
        id: 'tc-late',
        type: 'function',
        function: { name: lateFailure.name, arguments: '{}' },
      },
    ],
    [lateFailure],
    'thread-1',
    new Map(),
    new Map(),
    (name, value) => ({
      type: EventType.CUSTOM,
      timestamp: 0,
      name,
      value,
    }),
  )
  const yielded: Array<unknown> = []
  const finished = (async () => {
    let step = await run.next()
    while (!step.done) {
      yielded.push(step.value)
      step = await run.next()
    }
    return step.value
  })()
  await vi.advanceTimersByTimeAsync(100)
  const result = await finished

  expect(yielded).toMatchObject([
    { type: EventType.CUSTOM, name: 'late:progress', value: { step: 1 } },
  ])
  expect(result.results).toMatchObject([
    {
      toolCallId: 'tc-late',
      result: { error: 'late failure' },
      state: 'output-error',
    },
  ])
})
