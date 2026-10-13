import { describe, expect, it } from 'vitest'
import { chat } from '../src'
import { createMockAdapter, ev, serverTool } from './test-utils'
import type { ChatMiddleware, FetchWrapper } from '../src'

const toolTurn = (toolCallId: string) => [
  ev.runStarted(),
  ev.toolStart(toolCallId, 'lookup'),
  ev.toolArgs(toolCallId, '{}'),
  ev.toolEnd(toolCallId),
  ev.runFinished('tool_calls'),
]

const stopTurn = [
  ev.runStarted(),
  ev.textContent('Done'),
  ev.runFinished('stop'),
]

const lookup = serverTool('lookup', () => ({ ok: true }))

/** A wrapper that writes its name to `order`, then calls the next fetch. */
const recorder =
  (name: string, order: Array<string>): FetchWrapper =>
  (next) =>
  (input, init) => {
    order.push(name)
    return next(input, init)
  }

/** Call the wrapped fetch of each model call once. Give back the run order of each call. */
async function orderOfEachCall(options: {
  wrapFetch?: FetchWrapper
  middleware?: Array<ChatMiddleware>
  order: Array<string>
}) {
  const { order, ...chatOptions } = options
  const { adapter, calls } = createMockAdapter({
    iterations: [toolTurn('tc-1'), toolTurn('tc-2'), stopTurn],
  })
  await chat({
    adapter,
    messages: [{ role: 'user', content: 'Hi' }],
    tools: [lookup],
    stream: false,
    ...chatOptions,
  })
  const baseFetch: typeof fetch = async () => {
    order.push('base')
    return new Response('ok')
  }
  const result: Array<Array<string>> = []
  for (const call of calls) {
    order.length = 0
    await (call.wrapFetch ?? ((next) => next))(baseFetch)('https://x.test')
    result.push([...order])
  }
  return result
}

describe('chat({ wrapFetch })', () => {
  it('chains the chat() option, then the middleware wrappers in order', async () => {
    const order: Array<string> = []
    const seen = await orderOfEachCall({
      order,
      wrapFetch: recorder('chat', order),
      middleware: [
        {
          name: 'mw1',
          onConfig: () => ({ wrapFetch: recorder('mw1', order) }),
        },
        {
          name: 'mw2',
          onConfig: () => ({ wrapFetch: recorder('mw2', order) }),
        },
      ],
    })
    expect(seen[0]).toStrictEqual(['chat', 'mw1', 'mw2', 'base'])
  })

  it('keeps a middleware wrapper for one model call only', async () => {
    const order: Array<string> = []
    const seen = await orderOfEachCall({
      order,
      wrapFetch: recorder('chat', order),
      middleware: [
        {
          name: 'second-call',
          onConfig: (ctx) =>
            ctx.phase === 'beforeModel' && ctx.iteration === 1
              ? { wrapFetch: recorder('mw', order) }
              : undefined,
        },
      ],
    })
    expect(seen).toStrictEqual([
      ['chat', 'base'],
      ['chat', 'mw', 'base'],
      ['chat', 'base'],
    ])
  })

  it('does not wrap twice when a middleware spreads the config back', async () => {
    const order: Array<string> = []
    const seen = await orderOfEachCall({
      order,
      wrapFetch: recorder('chat', order),
      middleware: [
        { name: 'spread', onConfig: (_ctx, config) => ({ ...config }) },
      ],
    })
    expect(seen[0]).toStrictEqual(['chat', 'base'])
  })

  it('sends no wrapFetch when no wrapper is set', async () => {
    const { adapter, calls } = createMockAdapter({ iterations: [stopTurn] })
    await chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      stream: false,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.wrapFetch).toBeUndefined()
  })
})
