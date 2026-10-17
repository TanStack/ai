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

/**
 * A step that remembers values in a map, like the session log does. Each
 * step gets the key `key:<name>` and epoch 7, unless `run` says else.
 */
function mapStep(
  stored: Map<string, unknown>,
  run: (name: string) => StepRun = (name) => ({
    idempotencyKey: `key:${name}`,
    epoch: 7,
  }),
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
