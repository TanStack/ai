import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, chat, toolDefinition } from '@tanstack/ai'
import { bindDurable, createToolStep, durableTool } from '../src/durable-tool'
import { mockAdapter, text, toolCall } from './helpers'
import type { LogRecord } from '@tanstack/ai-persistence'
import type { StepRun } from '../src/durable-tool'

const invoiceDefinition = toolDefinition({
  name: 'create_invoice',
  description: 'Create an invoice',
  inputSchema: z.object({ orderId: z.string() }),
})

/** The run of each step of {@link mapStep}: the key `key:<name>`, epoch 7. */
const keyOf = (name: string) => ({ idempotencyKey: `key:${name}`, epoch: 7 })

/**
 * A step that remembers values in a map, like the session log does. Each
 * step gets the key `key:<name>` and epoch 7, unless `run` says else. Each
 * `sleep` adds the wake time it waits for to `sleeps`, and returns at once.
 */
function mapStep(
  stored: Map<string, unknown>,
  run: (name: string) => StepRun = keyOf,
  sleeps: Array<{ name: string; wakeAt: number }> = [],
) {
  return createToolStep({
    recorded: (name) =>
      stored.has(name)
        ? { found: true, value: stored.get(name) }
        : { found: false },
    record: async (name, value) => {
      stored.set(name, value)
    },
    run,
    sleep: async (sleep) => {
      sleeps.push(sleep)
    },
  })
}

describe('durableTool', () => {
  it('runs in plain chat() and runs each step', async () => {
    const create = vi.fn(async (orderId: string) => `inv-${orderId}`)
    const runs: Array<StepRun> = []
    const tool = durableTool(invoiceDefinition, async ({ orderId }, ctx) => {
      const invoiceId = await ctx.step.do(`create:${orderId}`, (run) => {
        runs.push(run)
        return create(orderId)
      })
      return { invoiceId, callId: ctx.toolCallId }
    })
    const { adapter } = mockAdapter([
      () => toolCall('create_invoice', { orderId: 'o1' }, 'call-9'),
      () => text('done'),
    ])

    const results: Array<unknown> = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'bill it' }],
      tools: [tool],
    })) {
      if (chunk.type === EventType.TOOL_CALL_RESULT) results.push(chunk.content)
    }

    expect(tool.replay).toBe('safe')
    expect(create).toHaveBeenCalledTimes(1)
    // No session: the key is the step name.
    expect(runs).toEqual([{ idempotencyKey: 'create:o1', epoch: 0 }])
    expect(results).toEqual([
      JSON.stringify({ invoiceId: 'inv-o1', callId: 'call-9' }),
    ])
  })

  it('throws from append outside a durable session', async () => {
    const tool = durableTool(invoiceDefinition, async (_args, ctx) => {
      ctx.append([{ type: 'app.invoice_created' }])
      return 'unreachable'
    })

    await expect(
      Promise.resolve(tool.execute?.({ orderId: 'o1' })),
    ).rejects.toThrow('durableTool append needs a harness session')
  })
})

describe('createToolStep', () => {
  it('returns a stored value without running the step again', async () => {
    const stored = new Map<string, unknown>([['create:o1', 'inv-stored']])
    const step = mapStep(stored)
    const fresh = vi.fn(() => 'fresh')

    expect(await step.do('create:o1', fresh)).toBe('inv-stored')
    expect(fresh).not.toHaveBeenCalled()
    expect(await step.do('send:o1', () => 'sent')).toBe('sent')
    expect(stored.get('send:o1')).toBe('sent')
  })

  it('gives fn the key and the epoch of its step', async () => {
    const step = mapStep(new Map())

    expect(await step.do('charge', (run) => run)).toEqual({
      idempotencyKey: 'key:charge',
      epoch: 7,
    })
  })

  it('returns the JSON value that a replay returns, also in a live run', async () => {
    const stored = new Map<string, unknown>()
    const step = mapStep(stored)

    const live = await step.do('when', () => ({ at: new Date(0) }))

    expect(live).toEqual({ at: '1970-01-01T00:00:00.000Z' })
    expect(stored.get('when')).toEqual(live)
    expect(await mapStep(stored).do('when', () => 'again')).toEqual(live)
  })

  it('fails a value that is not JSON, and stores nothing', async () => {
    const stored = new Map<string, unknown>()
    const step = mapStep(stored)

    await expect(step.do('big', () => 10n)).rejects.toThrow(
      'the value of step "big" is not JSON',
    )
    expect(stored.has('big')).toBe(false)
  })

  it('does not start a step when its run refuses', async () => {
    const fn = vi.fn(() => 'side effect')
    const step = mapStep(new Map(), () => {
      throw new Error('The host lost the log.')
    })

    await expect(step.do('charge', fn)).rejects.toThrow(
      'The host lost the log.',
    )
    expect(fn).not.toHaveBeenCalled()
  })

  it('throws when a tool call uses a step name twice', async () => {
    const step = mapStep(new Map())
    await step.do('same', () => 1)

    await expect(step.do('same', () => 2)).rejects.toThrow(
      'the step name "same" is already used',
    )
  })
})

describe('step.sleep', () => {
  it('stores the wake time once, so a run again waits for the same time', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: 1_000 })
    try {
      const stored = new Map<string, unknown>()
      const sleeps: Array<{ name: string; wakeAt: number }> = []
      await mapStep(stored, keyOf, sleeps).sleep({ name: 'day', ms: 500 })
      // The run again starts later, after a crash.
      vi.setSystemTime(1_200)
      await mapStep(stored, keyOf, sleeps).sleep({ name: 'day', ms: 500 })

      expect(stored.get('sleep:day')).toBe(1_500)
      expect(sleeps).toEqual([
        { name: 'day', wakeAt: 1_500 },
        { name: 'day', wakeAt: 1_500 },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses a negative time, and stores nothing', async () => {
    const stored = new Map<string, unknown>()

    await expect(
      mapStep(stored).sleep({ name: 'back', ms: -1 }),
    ).rejects.toThrow(RangeError)
    expect(stored.size).toBe(0)
  })

  it('waits the full time outside a session', async () => {
    vi.useFakeTimers({ now: 0 })
    try {
      const waited = vi.fn()
      const nap = durableTool(
        toolDefinition({ name: 'nap', description: 'Wait, then answer' }),
        async (_args, { step }) => {
          await step.sleep({ name: 'nap', ms: 1_000 })
          waited()
          return 'awake'
        },
      )
      const execute = nap.execute
      if (!execute) throw new Error('A durable tool has an execute.')

      const result = execute({}, { toolCallId: 'call-1', emitCustomEvent() {} })
      await vi.advanceTimersByTimeAsync(999)
      expect(waited).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      await expect(result).resolves.toBe('awake')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('bindDurable', () => {
  it('gives a durable tool the bound step and append of its call', async () => {
    const staged: Array<LogRecord> = []
    const stored = new Map<string, unknown>([['create:o1', 'inv-stored']])
    const tool = durableTool(invoiceDefinition, async ({ orderId }, ctx) => {
      ctx.append([{ type: 'app.invoice_created', orderId }])
      return ctx.step.do(`create:${orderId}`, () => 'inv-fresh')
    })
    const bound = bindDurable(tool, (toolCallId) => ({
      step: mapStep(toolCallId === 'call-1' ? stored : new Map()),
      append: (records) => staged.push(...records),
    }))

    const result = await bound.execute?.(
      { orderId: 'o1' },
      { toolCallId: 'call-1', emitCustomEvent: () => {} },
    )

    expect(result).toBe('inv-stored')
    expect(staged).toEqual([{ type: 'app.invoice_created', orderId: 'o1' }])
  })

  it('keeps the durable marker when a plugin copies the tool', async () => {
    const tool = durableTool(invoiceDefinition, async (_args, ctx) =>
      ctx.step.do('only', () => 'fresh'),
    )
    const bound = bindDurable({ ...tool }, () => ({
      step: mapStep(new Map([['only', 'bound']])),
      append: () => {},
    }))

    expect(
      await bound.execute?.(
        { orderId: 'o1' },
        { toolCallId: 'call-1', emitCustomEvent: () => {} },
      ),
    ).toBe('bound')
  })

  it('returns a tool that is not durable as it is', () => {
    const plain = invoiceDefinition.server(async () => 'plain')
    expect(
      bindDurable(plain, () => ({
        step: mapStep(new Map()),
        append: () => {},
      })),
    ).toBe(plain)
  })
})
