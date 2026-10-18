import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, getLogRecords, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, durableTool, logIdOf } from '../src'
import { INTERRUPTED_TOOL_RESULT } from '../src/resume'
import {
  CRASHING_OWNERSHIP,
  gate,
  mockAdapter,
  ownershipExpired,
  text,
  toolCall,
} from './helpers'
import type { AnyChatMiddleware, AnyTool, StreamChunk } from '@tanstack/ai'
import type { OwnershipOptions } from '../src'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })

function durablePersistence() {
  const { metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), metadata } }
}

type Durable = ReturnType<typeof durablePersistence>

async function openDurable(
  persistence: Durable,
  replies: Array<Reply>,
  tools: Array<AnyTool>,
  ownership?: OwnershipOptions,
) {
  const { adapter, calls } = mockAdapter(replies)
  const host = createHarnessHost({
    persistence,
    ...(ownership ? { ownership } : {}),
  })
  const session = await host.open(
    defineHarness({ name: 'test/durable-tools', adapter, tools }),
    {
      threadId: THREAD,
    },
  )
  return { host, session, calls }
}

/** The records of the log, of one type. */
async function recordsOf(persistence: Durable, type: string) {
  return (await persistence.stores.log.read({ logId: LOG }))
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

/** `openDurable` on a host that the test lets crash: see `ownershipExpired`. */
const openCrashing = (
  persistence: Durable,
  replies: Array<Reply>,
  tools: Array<AnyTool>,
) => openDurable(persistence, replies, tools, CRASHING_OWNERSHIP)

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
    const first = await openCrashing(
      persistence,
      [() => toolCall('pay', { orderId: 'o1' }, 'call-pay')],
      [pay],
    )
    const turn = first.session.send('pay order o1', { inputId: 'pay-1' })
    await twoDone.opened
    await waitFor(async () =>
      expect(
        (await recordsOf(persistence, 'harness.tool.step')).map(
          (record) => record.name,
        ),
      ).toEqual(['reserve', 'charge']),
    )
    // The first host stops: its ownership of the log expires.
    await ownershipExpired()

    const next = await openDurable(persistence, [() => text('paid')], [pay])

    expect(await next.session.settled({ inputId: 'pay-1' })).toMatchObject({
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
    const first = await openCrashing(
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
    void first.session.send('charge and mail', { inputId: 'batch-1' }).then(
      () => {},
      () => {},
    )
    await mailStarted.opened
    await waitFor(async () =>
      expect(await recordsOf(persistence, 'harness.tool.result')).toHaveLength(
        1,
      ),
    )
    // The first host stops: its ownership of the log expires.
    await ownershipExpired()

    const next = await openDurable(persistence, [() => text('done')], tools)
    await next.session.settled({ inputId: 'batch-1' })

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

describe('the final tool result across a crash', () => {
  it('gives the model the result that a middleware replaced, not the raw one', async () => {
    const persistence = durablePersistence()
    const mailStarted = gate()
    const tools = [
      toolDefinition({ name: 'charge', description: 'Charge a card' }).server(
        async () => 'charged card 4242-4242-4242-4242',
      ),
      toolDefinition({ name: 'mail', description: 'Send a mail' }).server(
        (_args, context) => {
          mailStarted.open()
          // The first host stops while the mail runs.
          return untilAborted(context?.abortSignal)
        },
      ),
    ]
    // A plugin-like middleware that hides the card number from the model.
    const hideCard: AnyChatMiddleware = {
      name: 'test:hide-card',
      onAfterToolCall: (_ctx, info) =>
        typeof info.result === 'string'
          ? {
              type: 'replaceResult',
              result: info.result.replace(/\d{4}(-\d{4}){3}/, '[card]'),
            }
          : undefined,
    }
    const openWith = (replies: Array<Reply>, ownership?: OwnershipOptions) => {
      const { adapter, calls } = mockAdapter(replies)
      const host = createHarnessHost({
        persistence,
        ...(ownership ? { ownership } : {}),
      })
      const harness = defineHarness({
        name: 'test/durable-final-result',
        adapter,
        tools,
        middleware: [hideCard],
      })
      return { host, calls, opened: host.open(harness, { threadId: THREAD }) }
    }
    const first = openWith(
      [
        () =>
          toolCalls([
            { id: 'call-charge', name: 'charge' },
            { id: 'call-mail', name: 'mail' },
          ]),
      ],
      CRASHING_OWNERSHIP,
    )
    void (await first.opened)
      .send('charge and mail', { inputId: 'final-1' })
      .then(
        () => {},
        () => {},
      )
    await mailStarted.opened
    await vi.waitFor(
      async () =>
        expect(
          await recordsOf(persistence, 'harness.tool.result'),
        ).toHaveLength(1),
      { timeout: 5_000 },
    )
    // The first host stops: its ownership of the log expires.
    await ownershipExpired()

    const next = openWith([() => text('done')])
    await (await next.opened).settled({ inputId: 'final-1' })

    const charged = next.calls[0].messages.find(
      (message: { toolCallId?: string }) =>
        message.toolCallId === 'call-charge',
    )
    expect(charged?.content).toBe('charged card [card]')
    const stored = JSON.stringify(
      await recordsOf(persistence, 'harness.tool.result'),
    )
    expect(stored).not.toContain('4242')
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

    await session.send('note it')

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
    const first = await openCrashing(
      persistence,
      [() => toolCall('note', {}, 'call-note')],
      [note],
    )
    void first.session.send('note it', { inputId: 'note-1' }).then(
      () => {},
      () => {},
    )
    await appended.opened
    // The first host stops: its ownership of the log expires.
    await ownershipExpired()

    // The durable tool runs again on the next host, and stops again there.
    const next = await openDurable(persistence, [], [note])
    await waitFor(async () =>
      expect(
        await recordsOf(persistence, 'harness.input.applied'),
      ).toHaveLength(2),
    )

    expect(await recordsOf(persistence, 'app.state_write')).toEqual([])
    await first.host.close().catch(() => {})
    await next.host.close().catch(() => {})
  })

  it('lands them with the call result, so a crash later in the batch keeps them', async () => {
    const persistence = durablePersistence()
    const note = durableTool(noteDefinition, async (_args, { append }) => {
      append([{ type: 'app.state_write', name: 'x', value: 1 }])
      return 'noted'
    })
    // Still runs when the host stops.
    const wait = toolDefinition({
      name: 'wait',
      description: 'Wait',
    }).server((_args, context) => untilAborted(context?.abortSignal))
    const { adapter } = mockAdapter([
      () =>
        toolCalls([
          { id: 'call-note', name: 'note' },
          { id: 'call-wait', name: 'wait' },
        ]),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/durable-tools-result',
        adapter,
        tools: [note, wait],
      }),
      {
        threadId: THREAD,
      },
    )
    const turn = session.send('note and wait', { inputId: 'result-1' })

    await waitFor(async () =>
      expect(await recordsOf(persistence, 'harness.tool.result')).toHaveLength(
        1,
      ),
    )
    // The stored result means the call never runs again, so its record is
    // in the log with it.
    expect(await recordsOf(persistence, 'app.state_write')).toEqual([
      { type: 'app.state_write', name: 'x', value: 1 },
    ])
    await host.close().catch(() => {})
    await Promise.resolve(turn).catch(() => {})
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
      {
        threadId: THREAD,
      },
    )
    const turn = session.send('note and check', { inputId: 'audit-1' })
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

    await session.send('note it')

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
    const first = await openCrashing(
      persistence,
      [() => toolCall('mail', {}, 'call-mail')],
      [mail],
    )
    void first.session.send('mail it', { inputId: 'mail-1' }).then(
      () => {},
      () => {},
    )
    await started.opened
    // The first host stops: its ownership of the log expires.
    await ownershipExpired()

    const next = await openDurable(persistence, [() => text('checked')], [mail])
    expect(await next.session.settled({ inputId: 'mail-1' })).toMatchObject({
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
    const open = async (
      replies: Array<Reply>,
      ownership?: OwnershipOptions,
    ) => {
      const { adapter, calls } = mockAdapter(replies)
      const host = createHarnessHost({
        persistence,
        ...(ownership ? { ownership } : {}),
      })
      const session = await host.open(
        defineHarness({
          name: 'test/durable-tools',
          adapter,
          tools: [look],
          middleware: [swap],
        }),
        {
          threadId: THREAD,
        },
      )
      return { host, session, calls }
    }
    const first = await open(
      [
        () => toolCall('look', {}, 'call-look'),
        () => toolCall('pay', {}, 'call-pay'),
      ],
      CRASHING_OWNERSHIP,
    )
    const turn = first.session.send('pay', { inputId: 'pay-1' })
    await charged.opened
    await waitFor(async () =>
      expect(await recordsOf(persistence, 'harness.tool.step')).toHaveLength(1),
    )
    // The first host stops: its ownership of the log expires.
    await ownershipExpired()

    const next = await open([() => text('paid')])
    expect(await next.session.settled({ inputId: 'pay-1' })).toMatchObject({
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
      {
        threadId: THREAD,
      },
    )

    await session.send('note it')

    expect(wrapped).toEqual(['note'])
    expect(await recordsOf(persistence, 'harness.tool.step')).toHaveLength(1)
    await host.close()
  })
})
