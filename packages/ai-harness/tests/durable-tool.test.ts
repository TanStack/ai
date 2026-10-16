import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, chat, toolDefinition } from '@tanstack/ai'
import { bindDurable, createToolStep, durableTool } from '../src/durable-tool'
import { mockAdapter, text, toolCall } from './helpers'
import type { LogRecord } from '@tanstack/ai-persistence'

const invoiceDefinition = toolDefinition({
  name: 'create_invoice',
  description: 'Create an invoice',
  inputSchema: z.object({ orderId: z.string() }),
})

/** A step that remembers values in a map, like the session log does. */
function mapStep(stored: Map<string, unknown>) {
  return createToolStep({
    recorded: (name) =>
      stored.has(name)
        ? { found: true, value: stored.get(name) }
        : { found: false },
    record: async (name, value) => {
      stored.set(name, value)
    },
  })
}

describe('durableTool', () => {
  it('runs in plain chat() and runs each step', async () => {
    const create = vi.fn(async (orderId: string) => `inv-${orderId}`)
    const tool = durableTool(invoiceDefinition, async ({ orderId }, ctx) => {
      const invoiceId = await ctx.step.do(`create:${orderId}`, () =>
        create(orderId),
      )
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
    ).rejects.toThrow('durableTool append needs a durable harness session')
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
