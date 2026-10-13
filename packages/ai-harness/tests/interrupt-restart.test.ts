import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { gate, mockAdapter, text, toolCall } from './helpers'
import type { AnyTool } from '@tanstack/ai'
import type { AnyAgent, HarnessRouting, HarnessSubagents } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

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
 * The stores of one thread, and a function that opens a new host on them,
 * like a server that started again. `durable` gives the hosts a log.
 */
function restartable(durable: boolean) {
  const { stores } = memoryPersistence()
  const { runs, metadata } = stores
  const log = memoryLogStore()
  const persistence = durable ? { stores: { log, runs, metadata } } : { stores }
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
      { threadId: THREAD },
    )
    return opened.then((session) => ({ host, session, calls: main.calls }))
  }
}

describe.each([
  { host: 'a host without a log', durable: false },
  { host: 'a durable host', durable: true },
])('a resolve after a restart on $host', ({ durable }) => {
  it("continues the main model's approval", async () => {
    const open = restartable(durable)
    const remove = removeTool()
    const first = await open({
      tools: [remove.tool],
      replies: [() => toolCall('remove', { path: 'b.txt' }, 'call_m')],
    })
    const stopped = await first.session.prompt('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    await first.host.close()

    const next = await open({
      tools: [remove.tool],
      replies: [() => text('Removed b.txt')],
    })
    expect(
      next.session.snapshot().pendingInterrupts.map((item) => item.id),
    ).toEqual([interrupt.id])
    const receipt = await next.session.resolve([
      { interruptId: interrupt.id, status: 'resolved', payload: true },
    ])
    expect(receipt.status).toBe('accepted')
    expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
      text: 'Removed b.txt',
    })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    await next.host.close()
  })

  it.each(['missing', 'duplicate', 'extra', 'payload'])(
    'keeps approval after a rejected %s resume',
    async (kind) => {
      const open = restartable(durable)
      const remove = removeTool()
      const first = await open({
        tools: [remove.tool],
        replies: [() => toolCall('remove', { path: 'b.txt' }, 'call_m')],
      })
      const stopped = await first.session.prompt('clean up')
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
      const rejected = await first.session.resolve(resume)
      expect(rejected.status).toBe('accepted')
      if (kind === 'missing' && durable) {
        await expect(
          first.session.operation(rejected.operationId ?? ''),
        ).resolves.toMatchObject({
          interrupts: [expect.objectContaining({ id: interrupt.id })],
        })
      } else {
        await expect(
          first.session.operation(rejected.operationId ?? ''),
        ).rejects.toThrow()
      }
      expect(remove.execute).not.toHaveBeenCalled()
      expect(
        first.session.snapshot().pendingInterrupts.map((item) => item.id),
      ).toEqual([interrupt.id])
      await first.host.close()
      const next = await open({
        tools: [remove.tool],
        replies: [() => text('Removed b.txt')],
      })
      expect(
        next.session.snapshot().pendingInterrupts.map((item) => item.id),
      ).toEqual([interrupt.id])
      const receipt = await next.session.resolve([valid])
      expect(receipt.status).toBe('accepted')
      expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
        text: 'Removed b.txt',
      })
      expect(remove.execute).toHaveBeenCalledTimes(1)
      await next.host.close()
    },
  )

  it('offers an interrupt once: after its resolve, a restart has none', async () => {
    const open = restartable(durable)
    const remove = removeTool()
    const first = await open({
      tools: [remove.tool],
      replies: [
        () => toolCall('remove', { path: 'b.txt' }, 'call_m'),
        () => text('Removed b.txt'),
      ],
    })
    const stopped = await first.session.prompt('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    const receipt = await first.session.resolve([
      { interruptId: interrupt.id, status: 'resolved', payload: true },
    ])
    await first.session.operation(receipt.operationId ?? '')
    await first.host.close()

    const next = await open({ tools: [remove.tool] })
    expect(next.session.snapshot().pendingInterrupts).toEqual([])
    expect(
      await next.session.resolve([
        { interruptId: interrupt.id, status: 'resolved', payload: true },
      ]),
    ).toMatchObject({ status: 'rejected', reason: 'no_pending_interrupts' })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    await next.host.close()
  })

  it('continues a subagents.router agent that stopped for approval', async () => {
    const open = restartable(durable)
    const remove = removeTool()
    const cleaner = cleanerAgent(remove.tool)
    const subagents = { agents: [cleaner], router: () => 'cleaner' }
    const first = await open({ subagents })
    const stopped = await first.session.prompt('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    await first.host.close()

    const next = await open({ subagents })
    const receipt = await next.session.resolve([
      { interruptId: interrupt.id, status: 'resolved', payload: true },
    ])
    expect(receipt.status).toBe('accepted')
    expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
      text: 'cleaner:\nRemoved a.txt',
    })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    expect(next.calls).toHaveLength(0)
    await next.host.close()
  })

  it('continues the plan of a root agent that stopped for approval', async () => {
    const open = restartable(durable)
    const remove = removeTool()
    const cleaner = cleanerAgent(remove.tool)
    const router = vi.fn(() => 'cleaner')
    const first = await open({ agents: [cleaner], routing: { router } })
    const stopped = await first.session.prompt('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    await first.host.close()

    const next = await open({ agents: [cleaner], routing: { router } })
    const receipt = await next.session.resolve([
      { interruptId: interrupt.id, status: 'resolved', payload: true },
    ])
    expect(receipt.status).toBe('accepted')
    expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
      text: 'cleaner:\nRemoved a.txt',
    })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    // The resolve continues the saved plan. It does not ask the router again.
    expect(router).toHaveBeenCalledTimes(1)
    await next.host.close()
  })
})

describe.each([false, true])(
  'committed approval phases (durable: %s)',
  (durable) => {
    it.each(['descriptor', 'binding', 'mixed'])(
      'retains a known approval when pending records are inconsistent (%s)',
      async (kind) => {
        const stores = memoryPersistence().stores
        const persistence = durable
          ? {
              stores: {
                log: memoryLogStore(),
                runs: stores.runs,
                metadata: stores.metadata,
                interrupts: stores.interrupts,
              },
            }
          : { stores }
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
        const initial = await session.prompt('remove')
        const approval = initial.interrupts?.[0]
        if (!approval) throw new Error('The turn did not stop for approval.')
        const records = await stores.interrupts.listPending(THREAD)
        const record = records[0]
        if (!record) throw new Error('The pending record is missing.')
        const read = vi
          .spyOn(stores.interrupts, 'listPending')
          .mockResolvedValue(
            kind === 'descriptor'
              ? [{ ...record, payload: {} }]
              : kind === 'binding'
                ? [
                    {
                      ...record,
                      payload: {
                        ...record.payload,
                        metadata: {
                          kind: 'approval',
                          'tanstack:interruptBinding': 'invalid',
                        },
                      },
                    },
                  ]
                : [
                    record,
                    {
                      ...record,
                      interruptId: 'other',
                      runId: 'other-run',
                      payload: { ...record.payload, id: 'other' },
                    },
                  ],
          )
        const receipt = await session.resolve([
          { interruptId: approval.id, status: 'resolved', payload: true },
        ])
        await expect(
          session.operation(receipt.operationId ?? ''),
        ).rejects.toThrow()
        expect(
          session.snapshot().pendingInterrupts.map((item) => item.id),
        ).toEqual([approval.id])
        expect(remove.execute).not.toHaveBeenCalled()
        read.mockRestore()
        const retry = await session.resolve([
          { interruptId: approval.id, status: 'resolved', payload: true },
        ])
        await session.operation(retry.operationId ?? '')
        expect(remove.execute).toHaveBeenCalledTimes(1)
        await host.close()
      },
    )

    it('consumes an approval after a final input error without executing its tool', async () => {
      const stores = memoryPersistence().stores
      const persistence = durable
        ? {
            stores: {
              log: memoryLogStore(),
              runs: stores.runs,
              metadata: stores.metadata,
              interrupts: stores.interrupts,
            },
          }
        : { stores }
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
      const initial = await session.prompt('remove')
      const approval = initial.interrupts?.[0]
      if (!approval) throw new Error('The turn did not stop for approval.')
      const receipt = await session.resolve([
        {
          interruptId: approval.id,
          status: 'resolved',
          payload: { approved: true, editedArgs: { path: {} } },
        },
      ])
      await expect(
        session.operation(receipt.operationId ?? ''),
      ).resolves.toEqual({ text: 'Input rejected.' })
      expect(before).toHaveBeenCalledTimes(1)
      expect(remove.execute).not.toHaveBeenCalled()
      expect(session.snapshot().pendingInterrupts).toEqual([])
      expect((await stores.interrupts.get(approval.id))?.status).toBe(
        'resolved',
      )
      await host.close()
    })

    it('keeps approval after schema drift and retries with the original schema', async () => {
      const stores = memoryPersistence().stores
      const persistence = durable
        ? {
            stores: {
              log: memoryLogStore(),
              runs: stores.runs,
              metadata: stores.metadata,
              interrupts: stores.interrupts,
            },
          }
        : { stores }
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
      const initial = await session.prompt('remove')
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
        { threadId: THREAD },
      )
      const rejected = await changedSession.resolve([
        { interruptId: approval.id, status: 'resolved', payload: true },
      ])
      await expect(
        changedSession.operation(rejected.operationId ?? ''),
      ).rejects.toThrow()
      expect(changedExecute).not.toHaveBeenCalled()
      expect(original.execute).not.toHaveBeenCalled()
      expect(
        changedSession.snapshot().pendingInterrupts.map((item) => item.id),
      ).toEqual([approval.id])
      await changed.close()
      const next = createHarnessHost({ persistence })
      const retrySession = await next.open(config, { threadId: THREAD })
      const retry = await retrySession.resolve([
        { interruptId: approval.id, status: 'resolved', payload: true },
      ])
      await expect(
        retrySession.operation(retry.operationId ?? ''),
      ).resolves.toEqual({ text: 'Done.' })
      expect(original.execute).toHaveBeenCalledTimes(1)
      await next.close()
    })

    it.each(['cancel', 'close'])(
      'keeps approval when %s stops an admitted resolve before execution',
      async (kind) => {
        const stores = memoryPersistence().stores
        const persistence = durable
          ? {
              stores: {
                log: memoryLogStore(),
                runs: stores.runs,
                metadata: stores.metadata,
                interrupts: stores.interrupts,
              },
            }
          : { stores }
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
        const initial = await session.prompt('remove')
        const approval = initial.interrupts?.[0]
        if (!approval) throw new Error('The turn did not stop for approval.')
        const hold = gate()
        const read = stores.interrupts.listPending.bind(stores.interrupts)
        const blocked = vi
          .spyOn(stores.interrupts, 'listPending')
          .mockImplementationOnce(async (thread) => {
            await hold.opened
            return read(thread)
          })
        const receipt = await session.resolve([
          { interruptId: approval.id, status: 'resolved', payload: true },
        ])
        const stopping =
          kind === 'close' ? host.close() : session.cancel(receipt.operationId)
        hold.open()
        await stopping
        await expect(
          session.operation(receipt.operationId ?? ''),
        ).rejects.toThrow()
        blocked.mockRestore()
        expect(remove.execute).not.toHaveBeenCalled()
        expect(
          session.snapshot().pendingInterrupts.map((item) => item.id),
        ).toEqual([approval.id])
        await host.close()
        const next = createHarnessHost({ persistence })
        const reopened = await next.open(config, { threadId: THREAD })
        const retry = await reopened.resolve([
          { interruptId: approval.id, status: 'resolved', payload: true },
        ])
        await expect(
          reopened.operation(retry.operationId ?? ''),
        ).resolves.toEqual({ text: 'Done.' })
        expect(remove.execute).toHaveBeenCalledTimes(1)
        await next.close()
      },
    )

    it.each(['provider', 'save'])(
      'after a pre-commit %s failure, keeps the approval only when its tool did not run',
      async (kind) => {
        // The provider fails after the approved tool ran. Without a log, the
        // save of the started turn fails before the tool. A durable host
        // saves through the log, and that write fails after the tool ran.
        const toolRan = kind === 'provider' || durable
        const stores = memoryPersistence().stores
        const log = memoryLogStore()
        const persistence = durable
          ? {
              stores: {
                log,
                runs: stores.runs,
                metadata: stores.metadata,
                interrupts: stores.interrupts,
              },
            }
          : { stores }
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
        const initial = await session.prompt('remove')
        const approval = initial.interrupts?.[0]
        if (!approval) throw new Error('The turn did not stop for approval.')
        const append = log.append.bind(log)
        const logWrite = vi
          .spyOn(log, 'append')
          .mockImplementation(async (thread, seq, records) => {
            if (
              kind === 'save' &&
              durable &&
              records.some((record) => record.type === 'harness.transcript')
            )
              throw new Error('transcript save failed')
            await append(thread, seq, records)
          })
        const save = vi.spyOn(stores.messages, 'saveThread')
        if (kind === 'save' && !durable)
          save.mockRejectedValue(new Error('transcript save failed'))
        const receipt = await session.resolve([
          { interruptId: approval.id, status: 'resolved', payload: true },
        ])
        await expect(
          session.operation(receipt.operationId ?? ''),
        ).rejects.toThrow()
        expect(remove.execute).toHaveBeenCalledTimes(toolRan ? 1 : 0)
        if (toolRan) {
          // Offering the approval again would run the tool a second time,
          // so it is used up.
          expect(session.snapshot().pendingInterrupts).toEqual([])
          expect((await stores.interrupts.get(approval.id))?.status).toBe(
            'resolved',
          )
        } else {
          expect(
            session.snapshot().pendingInterrupts.map((item) => item.id),
          ).toEqual([approval.id])
          expect((await stores.interrupts.get(approval.id))?.status).toBe(
            'pending',
          )
          expect(
            await stores.metadata.get('harness:interrupted', THREAD),
          ).toMatchObject({
            interrupts: [expect.objectContaining({ id: approval.id })],
          })
        }
        logWrite.mockRestore()
        save.mockRestore()
        await host.close()
        const next = createHarnessHost({ persistence })
        const reopened = await next.open(config, { threadId: THREAD })
        if (durable && kind === 'save') {
          // The failed log did not settle this applied input. Recovery retries it.
          expect(await reopened.settled(receipt.inputId)).toMatchObject({
            outcome: 'completed',
          })
        } else if (toolRan) {
          expect(
            await reopened.resolve([
              { interruptId: approval.id, status: 'resolved', payload: true },
            ]),
          ).toMatchObject({
            status: 'rejected',
            reason: 'no_pending_interrupts',
          })
        } else {
          expect(
            reopened.snapshot().pendingInterrupts.map((item) => item.id),
          ).toEqual([approval.id])
          const retry = await reopened.resolve([
            { interruptId: approval.id, status: 'resolved', payload: true },
          ])
          await expect(
            reopened.operation(retry.operationId ?? ''),
          ).resolves.toEqual({ text: 'Recovered.' })
        }
        expect(reopened.snapshot().pendingInterrupts).toEqual([])
        expect(remove.execute).toHaveBeenCalledTimes(1)
        await next.close()
      },
    )

    it('recovers the new client phase after metadata replacement fails', async () => {
      const stores = memoryPersistence().stores
      const persistence = durable
        ? {
            stores: {
              log: memoryLogStore(),
              runs: stores.runs,
              metadata: stores.metadata,
              interrupts: stores.interrupts,
            },
          }
        : { stores }
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
      const initial = await session.prompt('check')
      const approval = initial.interrupts?.[0]
      if (!approval) throw new Error('The turn did not stop for approval.')
      const metadata = vi
        .spyOn(stores.metadata, 'set')
        .mockRejectedValueOnce(new Error('metadata replacement failed'))
      const accepted = await session.resolve([
        {
          interruptId: approval.id,
          status: 'resolved',
          payload: { approved: true, editedArgs: { count: '2' } },
        },
      ])
      await session.operation(accepted.operationId ?? '')
      metadata.mockRestore()
      const pending = session.snapshot().pendingInterrupts
      expect(pending).toHaveLength(1)
      const client = pending[0]
      if (!client) throw new Error('The client phase is missing.')
      expect(client.id).not.toBe(approval.id)
      expect(client.metadata).toMatchObject({
        kind: 'client_tool',
        input: { count: 2 },
      })
      expect((await stores.interrupts.get(approval.id))?.status).toBe(
        'resolved',
      )
      await first.close()
      const next = createHarnessHost({ persistence })
      const reopened = await next.open(config, { threadId: THREAD })
      expect(
        reopened.snapshot().pendingInterrupts.map((item) => item.id),
      ).toEqual([client.id])
      const wrong = await reopened.resolve([
        {
          interruptId: client.id,
          status: 'resolved',
          payload: { ok: 'wrong' },
        },
      ])
      await expect(
        reopened.operation(wrong.operationId ?? ''),
      ).rejects.toThrow()
      expect(
        reopened.snapshot().pendingInterrupts.map((item) => item.id),
      ).toEqual([client.id])
      const valid = await reopened.resolve([
        { interruptId: client.id, status: 'resolved', payload: { ok: true } },
      ])
      await expect(
        reopened.operation(valid.operationId ?? ''),
      ).resolves.toEqual({ text: 'Checked.' })
      expect(reopened.snapshot().pendingInterrupts).toEqual([])
      await next.close()
    })

    it('keeps foreign pending descriptors outside the harness batch', async () => {
      const stores = memoryPersistence().stores
      const persistence = durable
        ? {
            stores: {
              log: memoryLogStore(),
              runs: stores.runs,
              metadata: stores.metadata,
              interrupts: stores.interrupts,
            },
          }
        : { stores }
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
      const initial = await session.prompt('remove')
      const approval = initial.interrupts?.[0]
      if (!approval) throw new Error('The turn did not stop for approval.')
      await stores.interrupts.create({
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
      const wrong = await session.resolve([
        { interruptId: 'unknown', status: 'resolved', payload: true },
      ])
      await expect(session.operation(wrong.operationId ?? '')).rejects.toThrow()
      expect(
        session.snapshot().pendingInterrupts.map((item) => item.id),
      ).toEqual([approval.id])
      const valid = await session.resolve([
        { interruptId: approval.id, status: 'resolved', payload: true },
      ])
      await session.operation(valid.operationId ?? '')
      expect(session.snapshot().pendingInterrupts).toEqual([])
      expect((await stores.interrupts.get('external'))?.status).toBe('pending')
      expect(remove.execute).toHaveBeenCalledTimes(1)
      await host.close()
    })
  },
)
