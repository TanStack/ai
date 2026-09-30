import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { executeToolCalls } from '../src/activities/chat/tools/tool-calls'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter, ev, serverTool } from './test-utils'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { StreamChunk, Tool, ToolCall } from '../src/types'

/** A promise and the function that resolves it. */
function gate() {
  let open = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
}

/** `true` when `promise` settles within `ms`, else `false`. */
function within(promise: Promise<void>, ms: number) {
  return Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ])
}

/** A tool that logs its start and end, and gives the event loop a turn between them. */
function loggingTool(name: string, log: Array<string>, extra?: Partial<Tool>) {
  return {
    ...serverTool(name, async () => {
      log.push(`${name} start`)
      await new Promise((resolve) => setTimeout(resolve, 0))
      log.push(`${name} end`)
      return `${name} done`
    }),
    ...extra,
  }
}

/** A model turn that calls `slow` and then `fast`, then a turn that answers. */
function twoCallBatch() {
  return createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.toolStart('call-slow', 'slow'),
        ev.toolArgs('call-slow', '{}'),
        ev.toolEnd('call-slow'),
        ev.toolStart('call-fast', 'fast'),
        ev.toolArgs('call-fast', '{}'),
        ev.toolEnd('call-fast'),
        ev.runFinished('tool_calls'),
      ],
      [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
    ],
  })
}

function runBatch(
  tools: Array<Tool>,
  options: {
    toolExecution?: 'parallel' | 'sequential'
    middleware?: Array<ChatMiddleware>
  } = {},
) {
  const { adapter } = twoCallBatch()
  return collectChunks(
    chat({
      adapter,
      messages: [{ role: 'user', content: 'Go' }],
      tools,
      ...options,
    }),
  )
}

function resultOrder(chunks: Array<StreamChunk>) {
  return chunks.flatMap((chunk) =>
    chunk.type === EventType.TOOL_CALL_RESULT ? [chunk.toolCallId] : [],
  )
}

function call(id: string, name: string): ToolCall {
  return { id, type: 'function', function: { name, arguments: '{}' } }
}

async function drain(generator: ReturnType<typeof executeToolCalls>) {
  let step = await generator.next()
  while (!step.done) step = await generator.next()
  return step.value.results.map((result) => [result.toolCallId, result.result])
}

describe('server tools of one batch', () => {
  it('run at the same time, and the results keep the call order', async () => {
    const fastStarted = gate()
    let slowSawFast = false
    const slow = serverTool('slow', async () => {
      slowSawFast = await within(fastStarted.opened, 1_000)
      return 'slow done'
    })
    const fast = serverTool('fast', () => {
      fastStarted.open()
      return 'fast done'
    })

    const chunks = await runBatch([slow, fast])

    expect(slowSawFast).toBe(true)
    expect(resultOrder(chunks)).toEqual(['call-slow', 'call-fast'])
  })

  it("run one at a time with toolExecution: 'sequential'", async () => {
    const log: Array<string> = []

    await runBatch([loggingTool('slow', log), loggingTool('fast', log)], {
      toolExecution: 'sequential',
    })

    expect(log).toEqual(['slow start', 'slow end', 'fast start', 'fast end'])
  })

  it('run one at a time when a tool of the batch is sequential', async () => {
    const log: Array<string> = []

    await runBatch([
      loggingTool('slow', log),
      loggingTool('fast', log, { sequential: true }),
    ])

    expect(log).toEqual(['slow start', 'slow end', 'fast start', 'fast end'])
  })

  it('call onBeforeToolCall in call order and onAfterToolCall in finish order', async () => {
    const hooks: Array<string> = []
    const fastDone = gate()
    const slow = serverTool('slow', async () => {
      await fastDone.opened
      return 'slow done'
    })
    const fast = serverTool('fast', () => 'fast done')
    const order: ChatMiddleware = {
      name: 'order',
      onBeforeToolCall: (_ctx, hookCtx) => {
        hooks.push(`before ${hookCtx.toolName}`)
      },
      onAfterToolCall: (_ctx, info) => {
        hooks.push(`after ${info.toolName}`)
        if (info.toolName === 'fast') fastDone.open()
      },
    }

    await runBatch([slow, fast], { middleware: [order] })

    expect(hooks).toEqual([
      'before slow',
      'before fast',
      'after fast',
      'after slow',
    ])
  })

  it('do not start after the run aborts, and get "Operation aborted"', async () => {
    const controller = new AbortController()
    const ran: Array<string> = []
    const tool = (name: string) =>
      serverTool(name, () => {
        ran.push(name)
        return 'ok'
      })

    const results = await drain(
      executeToolCalls(
        [call('a', 'first'), call('b', 'second')],
        [tool('first'), tool('second')],
        new Map(),
        new Map(),
        undefined,
        {
          onBeforeToolCall: async (toolCall) => {
            if (toolCall.id === 'b') controller.abort()
          },
        },
        undefined,
        controller.signal,
      ),
    )

    expect(ran).toEqual([])
    expect(results).toEqual([
      ['a', { error: 'Operation aborted' }],
      ['b', { error: 'Operation aborted' }],
    ])
  })

  it('stop starting tools in sequential mode once the run aborts', async () => {
    const controller = new AbortController()
    const first = serverTool('first', () => {
      controller.abort()
      return 'ok'
    })
    const second = serverTool('second', () => 'ran')

    const results = await drain(
      executeToolCalls(
        [call('a', 'first'), call('b', 'second')],
        [first, second],
        new Map(),
        new Map(),
        undefined,
        undefined,
        undefined,
        controller.signal,
        undefined,
        'sequential',
      ),
    )

    expect(results).toEqual([
      ['a', 'ok'],
      ['b', { error: 'Operation aborted' }],
    ])
  })
})
