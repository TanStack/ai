import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src'
import { executeToolCalls } from '../src/activities/chat/tools/tool-calls'
import { EventType } from '../src/types'

afterEach(() => {
  vi.useRealTimers()
})

/**
 * Count `then` calls on `promise` and on every promise derived from it.
 * `Promise.race` and `Promise.resolve` look `then` up on the instance, so
 * they are counted too. Native `await` is not.
 */
function countThenCalls<T>(
  promise: Promise<T>,
  counts: Map<Promise<unknown>, number>,
): Promise<T> {
  const then = promise.then.bind(promise)
  counts.set(promise, 0)
  promise.then = function (...args) {
    counts.set(promise, (counts.get(promise) ?? 0) + 1)
    return countThenCalls(then(...args), counts)
  } as typeof promise.then
  return promise
}

it('does not subscribe to a pending tool execution on every event poll', async () => {
  vi.useFakeTimers()
  const thenCallsByPromise = new Map<Promise<unknown>, number>()
  let finish: (value: string) => void = () => {}
  const slowTool = toolDefinition({
    name: 'slow',
    description: 'Finishes when the test says so',
    inputSchema: z.object({}),
  }).server(() =>
    countThenCalls(
      new Promise<string>((resolve) => {
        finish = resolve
      }),
      thenCallsByPromise,
    ),
  )

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
  // About 100 polls at 10 ms each. Subscribing on every poll makes about 100.
  await vi.advanceTimersByTimeAsync(1_000)
  const mostThenCallsOnOnePromise = Math.max(...thenCallsByPromise.values())

  // Settling wakes the poll at once and clears its timer.
  finish('done')
  const result = await done

  expect(mostThenCallsOnOnePromise).toBeLessThan(5)
  expect(vi.getTimerCount()).toBe(0)
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
