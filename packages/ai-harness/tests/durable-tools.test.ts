import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, getLogRecords, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, durableTool } from '../src'
import { INTERRUPTED_TOOL_RESULT } from '../src/resume'
import { gate, mockAdapter, text, toolCall } from './helpers'
import type { AnyChatMiddleware, AnyTool, StreamChunk } from '@tanstack/ai'
import type { Reply } from './helpers'

const THREAD = 't1'

function durablePersistence() {
  const { runs, metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), runs, metadata } }
}

type Durable = ReturnType<typeof durablePersistence>

async function openDurable(
  persistence: Durable,
  replies: Array<Reply>,
  tools: Array<AnyTool>,
) {
  const { adapter, calls } = mockAdapter(replies)
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({ name: 'test/durable-tools', adapter, tools }),
    { threadId: THREAD },
  )
  return { host, session, calls }
}

/** The records of the log, of one type. */
async function recordsOf(persistence: Durable, type: string) {
  return (await persistence.stores.log.read(THREAD))
    .map((entry) => entry.record)
    .filter((record) => record.type === type)
}

/** Wait like a host that stopped, until the call is aborted at close. */
const untilAborted = (signal: AbortSignal | undefined) =>
  new Promise<never>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('stopped')), {
      once: true,
    })
  })

/** Let another host take over: the run lease of `runId` expires. */
const expireLease = (persistence: Durable, runId: string) =>
  persistence.stores.runs.update(runId, { leaseExpiresAt: Date.now() - 1 })

/** One model call that calls every tool in `calls`. */
function toolCalls(
  calls: Array<{ id: string; name: string }>,
): Array<StreamChunk> {
  const now = Date.now()
  return [
    { type: EventType.RUN_STARTED, runId: 'r', threadId: 't', timestamp: now },
    ...calls.flatMap(
      ({ id, name }): Array<StreamChunk> => [
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: id,
          toolCallName: name,
          timestamp: now,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: id,
          delta: '{}',
          timestamp: now,
        },
        { type: EventType.TOOL_CALL_END, toolCallId: id, timestamp: now },
      ],
    ),
    {
      type: EventType.RUN_FINISHED,
      runId: 'r',
      threadId: 't',
      timestamp: now,
      metadata: { tanstack: { finishReason: 'tool_calls' } },
    },
  ]
}

describe('durable tools across a crash', () => {
  it('replays the finished steps and runs only the rest', async () => {
    const persistence = durablePersistence()
    const reserve = vi.fn(async () => 'r-1')
    const charge = vi.fn(async () => 'c-1')
    const ship = vi.fn(async () => 's-1')
    const twoDone = gate()
    const hostStops = gate()
    let isFirstRun = true
    const pay = durableTool(
      toolDefinition({
        name: 'pay',
        description: 'Reserve, charge, and ship an order',
        inputSchema: z.object({ orderId: z.string() }),
      }),
      async ({ orderId }, { step }) => {
        const reservation = await step.do('reserve', reserve)
        const payment = await step.do('charge', charge)
        if (isFirstRun) {
          isFirstRun = false
          twoDone.open()
          // The first host stops here.
          await hostStops.opened
        }
        const shipment = await step.do('ship', ship)
        return `${orderId}:${reservation}:${payment}:${shipment}`
      },
    )
    const first = await openDurable(
      persistence,
      [() => toolCall('pay', { orderId: 'o1' }, 'call-pay')],
      [pay],
    )
    const turn = first.session.prompt('pay order o1', { inputId: 'pay-1' })
    await twoDone.opened
    await vi.waitFor(async () =>
      expect(
        (await recordsOf(persistence, 'harness.tool.step')).map(
          (record) => record.name,
        ),
      ).toEqual(['reserve', 'charge']),
    )
    await expireLease(persistence, turn.id)

    const next = await openDurable(persistence, [() => text('paid')], [pay])

    expect(await next.session.settled('pay-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(reserve).toHaveBeenCalledTimes(1)
    expect(charge).toHaveBeenCalledTimes(1)
    expect(ship).toHaveBeenCalledTimes(1)
    const result = (await next.session.transcript()).find(
      (message) => message.role === 'tool' && message.toolCallId === 'call-pay',
    )
    expect(result?.content).toBe('o1:r-1:c-1:s-1')

    hostStops.open()
    await Promise.resolve(turn).catch(() => {})
    await first.host.close()
    await next.host.close()
  })

  it('keeps finished results of a cut batch, and gives the rest an error', async () => {
    const persistence = durablePersistence()
    const charge = vi.fn(async () => 'charged 100')
    const mailStarted = gate()
    const mail = vi.fn(
      async (_args: unknown, context?: { abortSignal?: AbortSignal }) => {
        mailStarted.open()
        // The first host stops while the mail runs.
        return untilAborted(context?.abortSignal)
      },
    )
    const tools = [
      toolDefinition({ name: 'charge', description: 'Charge a card' }).server(
        charge,
      ),
      toolDefinition({ name: 'mail', description: 'Send a mail' }).server(mail),
    ]
    const first = await openDurable(
      persistence,
      [
        () =>
          toolCalls([
            { id: 'call-charge', name: 'charge' },
            { id: 'call-mail', name: 'mail' },
          ]),
      ],
      tools,
    )
    const turn = first.session.prompt('charge and mail', { inputId: 'batch-1' })
    await mailStarted.opened
    await vi.waitFor(async () =>
      expect(await recordsOf(persistence, 'harness.tool.result')).toHaveLength(
        1,
      ),
    )
    await expireLease(persistence, turn.id)

    const next = await openDurable(persistence, [() => text('done')], tools)
    await next.session.settled('batch-1')

    const results = (await next.session.transcript()).filter(
      (message) => message.role === 'tool',
    )
    expect(results).toEqual([
      { role: 'tool', toolCallId: 'call-charge', content: 'charged 100' },
      {
        role: 'tool',
        toolCallId: 'call-mail',
        content: JSON.stringify(INTERRUPTED_TOOL_RESULT),
        error: INTERRUPTED_TOOL_RESULT.note,
      },
    ])
    expect(charge).toHaveBeenCalledTimes(1)
    expect(mail).toHaveBeenCalledTimes(1)
    await first.host.close().catch(() => {})
    await next.host.close()
  })
})

describe('host records of a tool batch', () => {
  const noteDefinition = toolDefinition({
    name: 'note',
    description: 'Write a note to the state',
  })

  it('lands them when the tool phase completes', async () => {
    const persistence = durablePersistence()
    const note = durableTool(noteDefinition, async (_args, { append }) => {
      append([{ type: 'app.state_write', name: 'x', value: 1 }])
      return 'noted'
    })
    const { host, session } = await openDurable(
      persistence,
      [() => toolCall('note', {}, 'call-note'), () => text('done')],
      [note],
    )

    await session.prompt('note it')

    expect(await recordsOf(persistence, 'app.state_write')).toEqual([
      { type: 'app.state_write', name: 'x', value: 1 },
    ])
    await host.close()
  })

  it('never lands them when a crash cuts the batch', async () => {
    const persistence = durablePersistence()
    const appended = gate()
    const note = durableTool(
      noteDefinition,
      async (_args, { append, abortSignal }) => {
        append([{ type: 'app.state_write', name: 'x', value: 1 }])
        appended.open()
        // The host stops before the batch completes.
        return untilAborted(abortSignal)
      },
    )
    const first = await openDurable(
      persistence,
      [() => toolCall('note', {}, 'call-note')],
      [note],
    )
    const turn = first.session.prompt('note it', { inputId: 'note-1' })
    await appended.opened
    await expireLease(persistence, turn.id)

    // The durable tool runs again on the next host, and stops again there.
    const next = await openDurable(persistence, [], [note])
    await vi.waitFor(async () =>
      expect(
        await recordsOf(persistence, 'harness.input.applied'),
      ).toHaveLength(2),
    )

    expect(await recordsOf(persistence, 'app.state_write')).toEqual([])
    await first.host.close().catch(() => {})
    await next.host.close().catch(() => {})
  })

  it('keeps them staged when a middleware appends records in the batch', async () => {
    const persistence = durablePersistence()
    const appended = gate()
    const audited = gate()
    const note = durableTool(
      noteDefinition,
      async (_args, { append, abortSignal }) => {
        append([{ type: 'app.state_write', name: 'x', value: 1 }])
        appended.open()
        // Still runs when the middleware appends.
        return untilAborted(abortSignal)
      },
    )
    const quick = toolDefinition({
      name: 'quick',
      description: 'Answer at once',
    }).server(async () => {
      await appended.opened
      return 'ok'
    })
    // Appends a record when `quick` ends, while `note` still runs.
    const audit: AnyChatMiddleware = {
      name: 'test:audit',
      onAfterToolCall: async (ctx, info) => {
        if (info.toolCallId !== 'call-quick') return
        await getLogRecords(ctx).append([{ type: 'app.audit' }])
        audited.open()
      },
    }
    const { adapter } = mockAdapter([
      () =>
        toolCalls([
          { id: 'call-note', name: 'note' },
          { id: 'call-quick', name: 'quick' },
        ]),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/durable-tools-audit',
        adapter,
        tools: [note, quick],
        middleware: [audit],
      }),
      { threadId: THREAD },
    )
    const turn = session.prompt('note and check', { inputId: 'audit-1' })
    await audited.opened

    expect(await recordsOf(persistence, 'app.audit')).toEqual([
      { type: 'app.audit' },
    ])
    // The batch did not complete, so the staged record is not in the log.
    expect(await recordsOf(persistence, 'app.state_write')).toEqual([])
    await host.close().catch(() => {})
    await Promise.resolve(turn).catch(() => {})
  })
})

describe('a durable tool with replay: never', () => {
  it('lands its staged records with the batch', async () => {
    const persistence = durablePersistence()
    const note = durableTool(
      toolDefinition({ name: 'note', description: 'Write a note' }),
      async (_args, { append }) => {
        append([{ type: 'app.state_write', name: 'x', value: 1 }])
        return 'noted'
      },
      { replay: 'never' },
    )
    const { host, session } = await openDurable(
      persistence,
      [() => toolCall('note', {}, 'call-note'), () => text('done')],
      [note],
    )

    await session.prompt('note it')

    expect(note.replay).toBe('never')
    expect(await recordsOf(persistence, 'app.state_write')).toEqual([
      { type: 'app.state_write', name: 'x', value: 1 },
    ])
    await host.close()
  })

  it('gives the model the tool error after a crash, and does not run again', async () => {
    const persistence = durablePersistence()
    const send = vi.fn(async () => 'sent')
    const started = gate()
    let runs = 0
    const mail = durableTool(
      toolDefinition({ name: 'mail', description: 'Send a mail' }),
      async (_args, { step, abortSignal }) => {
        runs += 1
        await step.do('send', send)
        started.open()
        // The first host stops here.
        return untilAborted(abortSignal)
      },
      { replay: 'never' },
    )
    const first = await openDurable(
      persistence,
      [() => toolCall('mail', {}, 'call-mail')],
      [mail],
    )
    const turn = first.session.prompt('mail it', { inputId: 'mail-1' })
    await started.opened
    await expireLease(persistence, turn.id)

    const next = await openDurable(persistence, [() => text('checked')], [mail])
    expect(await next.session.settled('mail-1')).toMatchObject({
      outcome: 'completed',
    })

    const result = (await next.session.transcript()).find(
      (message) =>
        message.role === 'tool' && message.toolCallId === 'call-mail',
    )
    expect(result?.error).toBe(INTERRUPTED_TOOL_RESULT.note)
    expect(send).toHaveBeenCalledTimes(1)
    expect(runs).toBe(1)
    await first.host.close().catch(() => {})
    await next.host.close()
  })
})

describe('durable tools that middleware returns', () => {
  it('binds a durable tool that onConfig swaps in during the turn', async () => {
    const persistence = durablePersistence()
    const charge = vi.fn(async () => 'c-1')
    const charged = gate()
    const hostStops = gate()
    let isFirstRun = true
    const pay = durableTool(
      toolDefinition({ name: 'pay', description: 'Pay the order' }),
      async (_args, { step, append }) => {
        const payment = await step.do('charge', charge)
        append([{ type: 'app.paid', payment }])
        if (isFirstRun) {
          isFirstRun = false
          charged.open()
          // The first host stops here.
          await hostStops.opened
        }
        return payment
      },
    )
    const look = toolDefinition({ name: 'look', description: 'Look' }).server(
      async () => 'seen',
    )
    // After `look` answered, the model gets `pay` in place of `look`, like
    // a framework that renders its tools from the state.
    const swap: AnyChatMiddleware = {
      name: 'swap',
      onConfig: (ctx, config) => {
        if (ctx.phase !== 'init' && ctx.phase !== 'beforeModel') return
        const looked = config.messages.some(
          (message) =>
            message.role === 'tool' && message.toolCallId === 'call-look',
        )
        return looked ? { tools: [pay] } : undefined
      },
    }
    const open = async (replies: Array<Reply>) => {
      const { adapter, calls } = mockAdapter(replies)
      const host = createHarnessHost({ persistence })
      const session = await host.open(
        defineHarness({
          name: 'test/durable-tools',
          adapter,
          tools: [look],
          middleware: [swap],
        }),
        { threadId: THREAD },
      )
      return { host, session, calls }
    }
    const first = await open([
      () => toolCall('look', {}, 'call-look'),
      () => toolCall('pay', {}, 'call-pay'),
    ])
    const turn = first.session.prompt('pay', { inputId: 'pay-1' })
    await charged.opened
    await vi.waitFor(async () =>
      expect(await recordsOf(persistence, 'harness.tool.step')).toHaveLength(1),
    )
    await expireLease(persistence, turn.id)

    const next = await open([() => text('paid')])
    expect(await next.session.settled('pay-1')).toMatchObject({
      outcome: 'completed',
    })

    expect(charge).toHaveBeenCalledTimes(1)
    expect(await recordsOf(persistence, 'app.paid')).toEqual([
      { type: 'app.paid', payment: 'c-1' },
    ])
    hostStops.open()
    await Promise.resolve(turn).catch(() => {})
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('keeps a middleware wrapper around a bound durable tool', async () => {
    const persistence = durablePersistence()
    const wrapped: Array<string> = []
    const note = durableTool(
      toolDefinition({ name: 'note', description: 'Write a note' }),
      async (_args, { step }) => step.do('write', async () => 'noted'),
    )
    const wrap: AnyChatMiddleware = {
      name: 'wrap',
      onConfig: (ctx, config) => {
        if (ctx.phase !== 'init') return
        return {
          tools: config.tools.map((tool) => ({
            ...tool,
            execute: async (args: unknown, context: any) => {
              wrapped.push(tool.name)
              return tool.execute?.(args, context)
            },
          })),
        }
      },
    }
    const { adapter } = mockAdapter([
      () => toolCall('note', {}, 'call-note'),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/durable-tools',
        adapter,
        tools: [note],
        middleware: [wrap],
      }),
      { threadId: THREAD },
    )

    await session.prompt('note it')

    expect(wrapped).toEqual(['note'])
    expect(await recordsOf(persistence, 'harness.tool.step')).toHaveLength(1)
    await host.close()
  })
})
