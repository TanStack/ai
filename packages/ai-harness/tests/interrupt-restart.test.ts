import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import {
  appendToLog,
  mockAdapter,
  storedThreadState,
  text,
  toolCall,
  turnInterrupts,
} from './helpers'
import type { AnyTool } from '@tanstack/ai'
import type { InterruptRecord, LogStore } from '@tanstack/ai-persistence'
import type { AnyAgent, HarnessRouting, HarnessSubagents } from '../src'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'

/** The interrupt `interruptId` in the log of `THREAD`, as a new host reads it. */
const storedInterrupt = async (log: LogStore, interruptId: string) =>
  (await storedThreadState(log, { threadId: THREAD })).interrupts.get(
    interruptId,
  )

/**
 * Another host appends `records` to the log of `THREAD`. It waits until the
 * session gave the log back.
 */
const writeAsOther = (
  log: LogStore,
  records: Parameters<typeof appendToLog>[2],
) => waitFor(() => appendToLog(log, { threadId: THREAD }, records))

/** Another host writes `interrupt` to the log of `THREAD`. */
const writeInterrupt = (
  log: LogStore,
  interrupt: Omit<InterruptRecord, 'status' | 'resolvedAt'>,
) => writeAsOther(log, [{ type: 'harness.interrupt', interrupt }])

/** A tool that asks approval before it removes a file. */
function removeTool() {
  const execute = vi.fn(async () => ({ removed: true }))
  const tool = toolDefinition({
    name: 'remove',
    description: 'Remove a file',
    needsApproval: true,
    inputSchema: z.object({ path: z.string() }),
  }).server(execute)
  return { tool, execute }
}

/** An agent whose model asks approval to remove `a.txt`, then reports. */
function cleanerAgent(tool: AnyTool) {
  const child = mockAdapter([
    () => toolCall('remove', { path: 'a.txt' }, 'call_c'),
    () => text('Removed a.txt'),
  ])
  return defineAgent({
    name: 'cleaner',
    description: 'Removes files',
    run: (ctx) => ctx.chat({ adapter: child.adapter, tools: [tool] }),
  })
}

/**
 * A log and metadata: a host that opens the thread after another one
 * closed takes it at once, as a server that started again.
 */
function approvalStores() {
  const { stores } = memoryPersistence()
  const { log, metadata } = stores
  return {
    stores,
    log,
    persistence: { stores: { log, metadata } },
  }
}

/**
 * The stores of one thread, and a function that opens a new host on them,
 * like a server that started again.
 */
function restartable() {
  const { metadata } = memoryPersistence().stores
  const persistence = { stores: { log: memoryLogStore(), metadata } }
  return (options: {
    tools?: ReadonlyArray<AnyTool>
    agents?: ReadonlyArray<AnyAgent>
    subagents?: HarnessSubagents<ReadonlyArray<AnyAgent>>
    routing?: HarnessRouting
    replies?: Array<Reply>
  }) => {
    const main = mockAdapter(options.replies ?? [])
    const host = createHarnessHost({ persistence })
    const opened = host.open(
      defineHarness({
        name: 'test/interrupt-restart',
        adapter: main.adapter,
        ...(options.tools ? { tools: options.tools } : {}),
        ...(options.agents ? { agents: options.agents } : {}),
        ...(options.subagents ? { subagents: options.subagents } : {}),
        ...(options.routing ? { routing: options.routing } : {}),
      }),
      {
        threadId: THREAD,
      },
    )
    return opened.then((session) => ({ host, session, calls: main.calls }))
  }
}

describe('a resolve after a restart', () => {
  it("continues the main model's approval", async () => {
    const open = restartable()
    const remove = removeTool()
    const first = await open({
      tools: [remove.tool],
      replies: [() => toolCall('remove', { path: 'b.txt' }, 'call_m')],
    })
    const stopped = await first.session.send('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    await first.host.close()

    const next = await open({
      tools: [remove.tool],
      replies: [() => text('Removed b.txt')],
    })
    expect(
      turnInterrupts(next.session.snapshot()).map((item) => item.id),
    ).toEqual([interrupt.id])
    const receipt = await next.session.resolve({
      resume: [
        { interruptId: interrupt.id, status: 'resolved', payload: true },
      ],
    })
    expect(receipt.status).toBe('accepted')
    expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
      text: 'Removed b.txt',
      media: [],
    })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    await next.host.close()
  })

  it.each(['missing', 'duplicate', 'extra', 'payload'])(
    'keeps approval after a rejected %s resume',
    async (kind) => {
      const open = restartable()
      const remove = removeTool()
      const first = await open({
        tools: [remove.tool],
        replies: [() => toolCall('remove', { path: 'b.txt' }, 'call_m')],
      })
      const stopped = await first.session.send('clean up')
      const interrupt = stopped.interrupts?.[0]
      if (!interrupt) throw new Error('The turn did not stop for approval.')
      const valid = {
        interruptId: interrupt.id,
        status: 'resolved' as const,
        payload: true,
      }
      const resume =
        kind === 'missing'
          ? []
          : kind === 'duplicate'
            ? [valid, valid]
            : kind === 'extra'
              ? [valid, { ...valid, interruptId: 'unknown' }]
              : [{ ...valid, payload: { approved: 'yes' } }]
      const rejected = await first.session.resolve({ resume })
      expect(rejected.status).toBe('accepted')
      await expect(
        first.session.operation(rejected.operationId ?? ''),
      ).rejects.toThrow()
      expect(remove.execute).not.toHaveBeenCalled()
      expect(
        turnInterrupts(first.session.snapshot()).map((item) => item.id),
      ).toEqual([interrupt.id])
      await first.host.close()
      const next = await open({
        tools: [remove.tool],
        replies: [() => text('Removed b.txt')],
      })
      expect(
        turnInterrupts(next.session.snapshot()).map((item) => item.id),
      ).toEqual([interrupt.id])
      const receipt = await next.session.resolve({ resume: [valid] })
      expect(receipt.status).toBe('accepted')
      expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
        text: 'Removed b.txt',
        media: [],
      })
      expect(remove.execute).toHaveBeenCalledTimes(1)
      await next.host.close()
    },
  )

  it('offers an interrupt once: after its resolve, a restart has none', async () => {
    const open = restartable()
    const remove = removeTool()
    const first = await open({
      tools: [remove.tool],
      replies: [
        () => toolCall('remove', { path: 'b.txt' }, 'call_m'),
        () => text('Removed b.txt'),
      ],
    })
    const stopped = await first.session.send('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    const receipt = await first.session.resolve({
      resume: [
        { interruptId: interrupt.id, status: 'resolved', payload: true },
      ],
    })
    await first.session.operation(receipt.operationId ?? '')
    await first.host.close()

    const next = await open({ tools: [remove.tool] })
    expect(turnInterrupts(next.session.snapshot())).toEqual([])
    expect(
      await next.session.resolve({
        resume: [
          { interruptId: interrupt.id, status: 'resolved', payload: true },
        ],
      }),
    ).toMatchObject({ status: 'rejected', reason: 'no_pending_interrupts' })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    await next.host.close()
  })

  it('continues a subagents.router agent that stopped for approval', async () => {
    const open = restartable()
    const remove = removeTool()
    const cleaner = cleanerAgent(remove.tool)
    const subagents = { agents: [cleaner], router: () => 'cleaner' }
    const first = await open({ subagents })
    const stopped = await first.session.send('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    await first.host.close()

    const next = await open({ subagents })
    const receipt = await next.session.resolve({
      resume: [
        { interruptId: interrupt.id, status: 'resolved', payload: true },
      ],
    })
    expect(receipt.status).toBe('accepted')
    expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
      text: 'cleaner:\nRemoved a.txt',
      media: [],
    })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    expect(next.calls).toHaveLength(0)
    await next.host.close()
  })

  it('continues an agent tool that stopped for approval, from where it stopped', async () => {
    const open = restartable()
    const remove = removeTool()
    const child = mockAdapter([
      () => toolCall('remove', { path: 'a.txt' }, 'call_c'),
      () => text('Removed a.txt'),
    ])
    const cleaner = defineAgent({
      name: 'cleaner',
      description: 'Removes files',
      run: (ctx) => ctx.chat({ adapter: child.adapter, tools: [remove.tool] }),
    })
    const subagents = { agents: [cleaner] }
    const first = await open({
      subagents,
      replies: [() => toolCall('cleaner', { prompt: 'clean' }, 'call_p')],
    })
    const stopped = await first.session.send('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    await first.host.close()

    const next = await open({ subagents, replies: [() => text('All clean.')] })
    expect(next.session.snapshot().pendingWaits).toEqual([
      expect.objectContaining({ waitId: interrupt.id, agent: 'cleaner' }),
    ])
    const receipt = await next.session.resolve({
      resume: [
        { interruptId: interrupt.id, status: 'resolved', payload: true },
      ],
    })
    expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
      text: 'All clean.',
      media: [],
    })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    // The agent went on with its second model call. It did not start again.
    expect(child.calls).toHaveLength(2)
    expect(JSON.stringify(next.calls[0].messages)).toContain('Removed a.txt')
    await next.host.close()
  })

  it('gives the step.ask answer of an agent tool to the agent on a new host', async () => {
    const open = restartable()
    const effect = vi.fn(() => 'once')
    const namer = defineAgent({
      name: 'namer',
      description: 'Asks a name',
      run: async (ctx) => {
        const step = ctx.harness!.step
        await step.do('effect', effect)
        const name = await step.ask({ name: 'name', message: 'Name?' })
        return `Hello, ${String(name)}.`
      },
    })
    const subagents = { agents: [namer] }
    const first = await open({
      subagents,
      replies: [() => toolCall('namer', {}, 'call_p')],
    })
    await first.session.send('greet me')
    const [wait] = first.session.snapshot().pendingWaits
    if (!wait) throw new Error('The turn did not stop for the question.')
    await first.host.close()

    const next = await open({ subagents, replies: [() => text('Greeted.')] })
    const receipt = await next.session.resolve({
      resume: [
        { interruptId: wait.waitId, status: 'resolved', payload: 'Ada' },
      ],
    })
    expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
      text: 'Greeted.',
      media: [],
    })
    // The step value came from the log on the new host.
    expect(effect).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(next.calls[0].messages)).toContain('Hello, Ada.')
    await next.host.close()
  })

  it('continues the plan of a root agent that stopped for approval', async () => {
    const open = restartable()
    const remove = removeTool()
    const cleaner = cleanerAgent(remove.tool)
    const router = vi.fn(() => 'cleaner')
    const first = await open({ agents: [cleaner], routing: { router } })
    const stopped = await first.session.send('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    await first.host.close()

    const next = await open({ agents: [cleaner], routing: { router } })
    const receipt = await next.session.resolve({
      resume: [
        { interruptId: interrupt.id, status: 'resolved', payload: true },
      ],
    })
    expect(receipt.status).toBe('accepted')
    expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
      text: 'cleaner:\nRemoved a.txt',
      media: [],
    })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    // The resolve continues the saved plan. It does not ask the router again.
    expect(router).toHaveBeenCalledTimes(1)
    await next.host.close()
  })
})

describe('committed approval phases', () => {
  it.each(['descriptor', 'mixed'])(
    'retains a known approval when another host writes an inconsistent pending interrupt (%s)',
    async (kind) => {
      const { log, persistence } = approvalStores()
      const remove = removeTool()
      const main = mockAdapter([
        () => toolCall('remove', { path: 'a.txt' }, 'inconsistent-call'),
        () => text('Done.'),
      ])
      const config = defineHarness({
        name: 'inconsistent-approval',
        adapter: main.adapter,
        tools: [remove.tool],
      })
      const host = createHarnessHost({ persistence })
      const session = await host.open(config, { threadId: THREAD })
      const initial = await session.send('remove')
      const approval = initial.interrupts?.[0]
      if (!approval) throw new Error('The turn did not stop for approval.')
      const record = await storedInterrupt(log, approval.id)
      if (!record) throw new Error('The pending record is missing.')
      // `descriptor`: an interrupt of the same run whose descriptor does not
      // match its id. `mixed`: an approval of another run.
      await writeInterrupt(
        log,
        kind === 'descriptor'
          ? { ...record, interruptId: 'other', payload: {} }
          : {
              ...record,
              interruptId: 'other',
              runId: 'other-run',
              payload: { ...record.payload, id: 'other' },
            },
      )
      const receipt = await session.resolve({
        resume: [
          { interruptId: approval.id, status: 'resolved', payload: true },
        ],
      })
      await expect(
        session.operation(receipt.operationId ?? ''),
      ).rejects.toThrow()
      expect(turnInterrupts(session.snapshot()).map((item) => item.id)).toEqual(
        [approval.id],
      )
      expect(remove.execute).not.toHaveBeenCalled()
      // The other host cancels its interrupt. Then a retry runs the tool.
      await writeAsOther(log, [
        {
          type: 'harness.interrupt.end',
          interruptId: 'other',
          status: 'cancelled',
          at: Date.now(),
        },
      ])
      const retry = await session.resolve({
        resume: [
          { interruptId: approval.id, status: 'resolved', payload: true },
        ],
      })
      await session.operation(retry.operationId ?? '')
      expect(remove.execute).toHaveBeenCalledTimes(1)
      await host.close()
    },
  )

  it('consumes an approval after a final input error without executing its tool', async () => {
    const { log, persistence } = approvalStores()
    const remove = removeTool()
    const before = vi.fn()
    const main = mockAdapter([
      () => toolCall('remove', { path: 'a.txt' }, 'invalid-final-call'),
      () => text('Input rejected.'),
    ])
    const config = defineHarness({
      name: 'invalid-final-approval',
      adapter: main.adapter,
      tools: [remove.tool],
      middleware: [{ name: 'observe', onBeforeToolCall: before }],
    })
    const host = createHarnessHost({ persistence })
    const session = await host.open(config, { threadId: THREAD })
    const initial = await session.send('remove')
    const approval = initial.interrupts?.[0]
    if (!approval) throw new Error('The turn did not stop for approval.')
    const receipt = await session.resolve({
      resume: [
        {
          interruptId: approval.id,
          status: 'resolved',
          payload: { approved: true, editedArgs: { path: {} } },
        },
      ],
    })
    await expect(session.operation(receipt.operationId ?? '')).resolves.toEqual(
      { text: 'Input rejected.', media: [] },
    )
    expect(before).toHaveBeenCalledTimes(1)
    expect(remove.execute).not.toHaveBeenCalled()
    expect(turnInterrupts(session.snapshot())).toEqual([])
    expect((await storedInterrupt(log, approval.id))?.status).toBe('resolved')
    await host.close()
  })

  it('keeps approval after schema drift and retries with the original schema', async () => {
    const { persistence } = approvalStores()
    const original = removeTool()
    const main = mockAdapter([
      () => toolCall('remove', { path: 'a.txt' }, 'drift-call'),
      () => text('Done.'),
    ])
    const config = defineHarness({
      name: 'schema-drift',
      adapter: main.adapter,
      tools: [original.tool],
    })
    const first = createHarnessHost({ persistence })
    const session = await first.open(config, { threadId: THREAD })
    const initial = await session.send('remove')
    const approval = initial.interrupts?.[0]
    if (!approval) throw new Error('The turn did not stop for approval.')
    await first.close()
    const changedExecute = vi.fn(async () => 'must not run')
    const changedTool = toolDefinition({
      name: 'remove',
      description: 'Remove',
      needsApproval: true,
      inputSchema: z.object({ path: z.number() }),
    }).server(changedExecute)
    const changed = createHarnessHost({ persistence })
    const changedSession = await changed.open(
      defineHarness({
        name: 'schema-drift',
        adapter: main.adapter,
        tools: [changedTool],
      }),
      {
        threadId: THREAD,
      },
    )
    const rejected = await changedSession.resolve({
      resume: [{ interruptId: approval.id, status: 'resolved', payload: true }],
    })
    await expect(
      changedSession.operation(rejected.operationId ?? ''),
    ).rejects.toThrow()
    expect(changedExecute).not.toHaveBeenCalled()
    expect(original.execute).not.toHaveBeenCalled()
    expect(
      turnInterrupts(changedSession.snapshot()).map((item) => item.id),
    ).toEqual([approval.id])
    await changed.close()
    const next = createHarnessHost({ persistence })
    const retrySession = await next.open(config, {
      threadId: THREAD,
    })
    const retry = await retrySession.resolve({
      resume: [{ interruptId: approval.id, status: 'resolved', payload: true }],
    })
    await expect(
      retrySession.operation(retry.operationId ?? ''),
    ).resolves.toEqual({ text: 'Done.', media: [] })
    expect(original.execute).toHaveBeenCalledTimes(1)
    await next.close()
  })

  it.each(['cancel', 'close'])(
    'keeps approval when %s stops an admitted resolve before execution',
    async (kind) => {
      const { persistence } = approvalStores()
      const remove = removeTool()
      const main = mockAdapter([
        () => toolCall('remove', { path: 'a.txt' }, 'cancel-call'),
        () => text('Done.'),
      ])
      const config = defineHarness({
        name: 'cancel-approval',
        adapter: main.adapter,
        tools: [remove.tool],
      })
      const host = createHarnessHost({ persistence })
      const session = await host.open(config, { threadId: THREAD })
      const initial = await session.send('remove')
      const approval = initial.interrupts?.[0]
      if (!approval) throw new Error('The turn did not stop for approval.')
      const receipt = await session.resolve({
        resume: [
          { interruptId: approval.id, status: 'resolved', payload: true },
        ],
      })
      // The stop lands right after the admission, before the turn runs.
      await (kind === 'close'
        ? host.close()
        : session.cancel({ operationId: receipt.operationId }))
      await expect(
        session.operation(receipt.operationId ?? ''),
      ).rejects.toThrow()
      expect(remove.execute).not.toHaveBeenCalled()
      expect(turnInterrupts(session.snapshot()).map((item) => item.id)).toEqual(
        [approval.id],
      )
      await host.close()
      const next = createHarnessHost({ persistence })
      const reopened = await next.open(config, { threadId: THREAD })
      const retry = await reopened.resolve({
        resume: [
          { interruptId: approval.id, status: 'resolved', payload: true },
        ],
      })
      await expect(
        reopened.operation(retry.operationId ?? ''),
      ).resolves.toEqual({ text: 'Done.', media: [] })
      expect(remove.execute).toHaveBeenCalledTimes(1)
      await next.close()
    },
  )

  it.each(['provider', 'save'])(
    'after a pre-commit %s failure, uses up the approval of the tool that ran',
    async (kind) => {
      // The provider fails after the approved tool ran. The transcript
      // save goes through the log, and that write fails after the tool ran.
      const { log, persistence } = approvalStores()
      const remove = removeTool()
      const main = mockAdapter(
        kind === 'provider'
          ? [
              () => toolCall('remove', { path: 'a.txt' }, 'failed-call'),
              () =>
                (async function* () {
                  throw new Error('provider failed before commit')
                })(),
              () => text('Recovered.'),
            ]
          : [
              () => toolCall('remove', { path: 'a.txt' }, 'failed-call'),
              () => text('Recovered.'),
              () => text('Recovered.'),
            ],
      )
      const config = defineHarness({
        name: 'failed-approval',
        adapter: main.adapter,
        tools: [remove.tool],
      })
      const host = createHarnessHost({ persistence })
      const session = await host.open(config, { threadId: THREAD })
      const initial = await session.send('remove')
      const approval = initial.interrupts?.[0]
      if (!approval) throw new Error('The turn did not stop for approval.')
      const append = log.append.bind(log)
      const logWrite = vi
        .spyOn(log, 'append')
        .mockImplementation(async (batch) => {
          if (
            kind === 'save' &&
            batch.records.some((record) => record.type === 'harness.transcript')
          )
            throw new Error('transcript save failed')
          await append(batch)
        })
      const receipt = await session.resolve({
        resume: [
          { interruptId: approval.id, status: 'resolved', payload: true },
        ],
      })
      await expect(
        session.operation(receipt.operationId ?? ''),
      ).rejects.toThrow()
      expect(remove.execute).toHaveBeenCalledTimes(1)
      // Offering the approval again would run the tool a second time, so
      // it is used up.
      expect(turnInterrupts(session.snapshot())).toEqual([])
      logWrite.mockRestore()
      await host.close()
      const next = createHarnessHost({ persistence })
      const reopened = await next.open(config, { threadId: THREAD })
      if (kind === 'save') {
        // The failed log did not settle this applied input. Recovery retries it.
        expect(
          await reopened.settled({ inputId: receipt.inputId }),
        ).toMatchObject({
          outcome: 'completed',
        })
      } else {
        expect(
          await reopened.resolve({
            resume: [
              { interruptId: approval.id, status: 'resolved', payload: true },
            ],
          }),
        ).toMatchObject({
          status: 'rejected',
          reason: 'no_pending_interrupts',
        })
      }
      expect(turnInterrupts(reopened.snapshot())).toEqual([])
      expect(remove.execute).toHaveBeenCalledTimes(1)
      await next.close()
    },
  )

  it('recovers the new client phase after metadata replacement fails', async () => {
    const { stores, log, persistence } = approvalStores()
    const tool = toolDefinition({
      name: 'check',
      description: 'Check',
      needsApproval: true,
      inputSchema: z.object({ count: z.number() }),
      outputSchema: z.object({ ok: z.boolean() }),
    }).client()
    const main = mockAdapter([
      () => toolCall('check', { count: 1 }, 'phase-call'),
      () => text('Checked.'),
    ])
    const config = defineHarness({
      name: 'phase-recovery',
      adapter: main.adapter,
      tools: [tool],
    })
    const first = createHarnessHost({ persistence })
    const session = await first.open(config, { threadId: THREAD })
    const initial = await session.send('check')
    const approval = initial.interrupts?.[0]
    if (!approval) throw new Error('The turn did not stop for approval.')
    const metadata = vi
      .spyOn(stores.metadata, 'set')
      .mockRejectedValueOnce(new Error('metadata replacement failed'))
    const accepted = await session.resolve({
      resume: [
        {
          interruptId: approval.id,
          status: 'resolved',
          payload: { approved: true, editedArgs: { count: '2' } },
        },
      ],
    })
    await session.operation(accepted.operationId ?? '')
    metadata.mockRestore()
    const pending = turnInterrupts(session.snapshot())
    expect(pending).toHaveLength(1)
    const client = pending[0]
    if (!client) throw new Error('The client phase is missing.')
    expect(client.id).not.toBe(approval.id)
    expect(client.metadata).toMatchObject({
      kind: 'client_tool',
      input: { count: 2 },
    })
    expect((await storedInterrupt(log, approval.id))?.status).toBe('resolved')
    await first.close()
    const next = createHarnessHost({ persistence })
    const reopened = await next.open(config, { threadId: THREAD })
    expect(turnInterrupts(reopened.snapshot()).map((item) => item.id)).toEqual([
      client.id,
    ])
    const wrong = await reopened.resolve({
      resume: [
        {
          interruptId: client.id,
          status: 'resolved',
          payload: { ok: 'wrong' },
        },
      ],
    })
    await expect(reopened.operation(wrong.operationId ?? '')).rejects.toThrow()
    expect(turnInterrupts(reopened.snapshot()).map((item) => item.id)).toEqual([
      client.id,
    ])
    const valid = await reopened.resolve({
      resume: [
        { interruptId: client.id, status: 'resolved', payload: { ok: true } },
      ],
    })
    await expect(reopened.operation(valid.operationId ?? '')).resolves.toEqual({
      text: 'Checked.',
      media: [],
    })
    expect(turnInterrupts(reopened.snapshot())).toEqual([])
    await next.close()
  })

  it('keeps foreign pending descriptors outside the harness batch', async () => {
    const { log, persistence } = approvalStores()
    const remove = removeTool()
    const main = mockAdapter([
      () => toolCall('remove', { path: 'a.txt' }, 'owned-call'),
      () => text('Done.'),
    ])
    const config = defineHarness({
      name: 'foreign-interrupt',
      adapter: main.adapter,
      tools: [remove.tool],
    })
    const host = createHarnessHost({ persistence })
    const session = await host.open(config, { threadId: THREAD })
    const initial = await session.send('remove')
    const approval = initial.interrupts?.[0]
    if (!approval) throw new Error('The turn did not stop for approval.')
    await writeInterrupt(log, {
      interruptId: 'external',
      runId: 'external-run',
      threadId: THREAD,
      requestedAt: Date.now(),
      payload: {
        id: 'external',
        reason: 'external',
        message: 'Another owner',
      },
    })
    const wrong = await session.resolve({
      resume: [{ interruptId: 'unknown', status: 'resolved', payload: true }],
    })
    await expect(session.operation(wrong.operationId ?? '')).rejects.toThrow()
    expect(turnInterrupts(session.snapshot()).map((item) => item.id)).toEqual([
      approval.id,
    ])
    const valid = await session.resolve({
      resume: [{ interruptId: approval.id, status: 'resolved', payload: true }],
    })
    await session.operation(valid.operationId ?? '')
    expect(turnInterrupts(session.snapshot())).toEqual([])
    expect((await storedInterrupt(log, 'external'))?.status).toBe('pending')
    expect(remove.execute).toHaveBeenCalledTimes(1)
    await host.close()
  })
})
