import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  turnInterrupts,
} from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

/** A client tool: the harness has no implementation, the client sends the result. */
const openScreen = toolDefinition({
  name: 'openScreen',
  description: 'Open a screen in the browser. Runs on the client.',
  inputSchema: z.object({ route: z.string() }),
  outputSchema: z.object({ opened: z.boolean() }),
})

/** A model call that fails after it started. */
const fails: Reply = () =>
  (async function* (): AsyncGenerator<StreamChunk> {
    yield {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: Date.now(),
    }
    throw new Error('model down')
  })()

/**
 * A log and metadata: a host that opens the thread after another one
 * closed takes it at once, as after a restart.
 */
function persistenceFor() {
  const { metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), metadata } }
}

describe('resolve', () => {
  it('keeps the interrupt when the resume fails validation, so a correct resolve continues the turn', async () => {
    const { adapter, calls } = mockAdapter([
      () => toolCall('openScreen', { route: '/settings' }),
      () => text('Opened it.'),
    ])
    const host = createHarnessHost({ persistence: persistenceFor() })
    const session = await host.open(
      defineHarness({
        name: 'test/bad-resume',
        adapter,
        tools: [openScreen],
      }),
      {
        threadId: 't1',
      },
    )
    const turn = await session.send('Open settings.')
    const interruptId = turn.interrupts?.[0]?.id
    if (!interruptId) throw new Error('The turn did not stop for the tool.')

    // A client tool needs a result, not `true`.
    await session.resolve({
      resume: [{ interruptId, status: 'resolved', payload: true }],
      inputId: 'wrong',
    })
    expect(await session.settled({ inputId: 'wrong' })).toMatchObject({
      outcome: 'failed',
    })
    expect(session.snapshot()).toMatchObject({
      status: 'requires_action',
      pendingWaits: [{ waitId: interruptId, turn: true }],
    })

    const right = await session.resolve({
      resume: [{ interruptId, status: 'resolved', payload: { opened: true } }],
      inputId: 'right',
    })
    expect(right.status).toBe('accepted')
    expect(await session.settled({ inputId: 'right' })).toMatchObject({
      outcome: 'completed',
    })
    expect(calls).toHaveLength(2)
    expect(turnInterrupts(session.snapshot())).toEqual([])
    await host.close()
  })

  it("gives the turn after a resolve the input's context, also after a restart", async () => {
    const seen: Array<unknown> = []
    const probe = toolDefinition({
      name: 'probe',
      description: 'Probe. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({}),
    }).server((_input, toolContext) => {
      seen.push(toolContext?.context)
      return Promise.resolve({ ok: true })
    })
    const persistence = persistenceFor()
    const open = (replies: Array<Reply>) => {
      const host = createHarnessHost({ persistence })
      const harness = defineHarness({
        name: 'test/resume-context',
        adapter: mockAdapter(replies).adapter,
        tools: [probe],
      })
      return { host, session: host.open(harness, { threadId: 't1' }) }
    }

    const first = open([() => toolCall('probe', {})])
    const turn = await (
      await first.session
    ).send('Probe.', { context: { screen: 'settings' } })
    const interruptId = turn.interrupts?.[0]?.id
    if (!interruptId) throw new Error('The turn did not stop for the approval.')
    await first.host.close()

    const second = open([() => text('Done.')])
    const session = await second.session
    await session.resolve({
      resume: [{ interruptId, status: 'resolved', payload: true }],
      inputId: 'approve',
    })
    expect(await session.settled({ inputId: 'approve' })).toMatchObject({
      outcome: 'completed',
    })
    // The harness adds the run of the turn to the context.
    expect(seen).toEqual([
      { screen: 'settings', run: expect.objectContaining({ threadId: 't1' }) },
    ])
    await second.host.close()
  })

  it('refuses a new message while the thread waits for interrupts', async () => {
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({ env: z.string() }),
    }).server(async () => ({ ok: true }))
    const { adapter } = mockAdapter([() => toolCall('deploy', { env: 'prod' })])
    const host = createHarnessHost({ persistence: persistenceFor() })
    const session = await host.open(
      defineHarness({ name: 'test/waits', adapter, tools: [deploy] }),
      {
        threadId: 't1',
      },
    )
    const turn = await session.send('Deploy.')
    expect(turn.interrupts).toHaveLength(1)

    expect(
      await session.send('And then?', { mode: 'followUp' }).receipt,
    ).toMatchObject({
      status: 'rejected',
      reason: 'pending_interrupts',
    })
    expect(session.snapshot().status).toBe('requires_action')
    await host.close()
  })

  it('does not bring the interrupt back when the turn fails after the resume ran', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({ env: z.string() }),
    }).server(execute)
    const { adapter } = mockAdapter([
      () => toolCall('deploy', { env: 'prod' }),
      fails,
    ])
    const host = createHarnessHost({ persistence: persistenceFor() })
    const session = await host.open(
      defineHarness({
        name: 'test/late-failure',
        adapter,
        tools: [deploy],
      }),
      {
        threadId: 't1',
      },
    )
    const turn = await session.send('Deploy.')
    const interruptId = turn.interrupts?.[0]?.id
    if (!interruptId) throw new Error('The turn did not stop for approval.')

    await session.resolve({
      resume: [{ interruptId, status: 'resolved', payload: true }],
      inputId: 'approve',
    })
    expect(await session.settled({ inputId: 'approve' })).toMatchObject({
      outcome: 'failed',
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(turnInterrupts(session.snapshot())).toEqual([])
    expect(
      await session.resolve({
        resume: [{ interruptId, status: 'resolved', payload: true }],
      }),
    ).toMatchObject({ status: 'rejected', reason: 'no_pending_interrupts' })
    await host.close()
  })

  it('does not bring the interrupt back after a restart when the turn failed after the resume ran', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({ env: z.string() }),
    }).server(execute)
    const { adapter } = mockAdapter([
      () => toolCall('deploy', { env: 'prod' }),
      fails,
    ])
    const harness = defineHarness({
      name: 'test/late-failure-restart',
      adapter,
      tools: [deploy],
    })
    const persistence = persistenceFor()
    const first = createHarnessHost({ persistence })
    const session = await first.open(harness, { threadId: 't1' })
    const turn = await session.send('Deploy.')
    const interruptId = turn.interrupts?.[0]?.id
    if (!interruptId) throw new Error('The turn did not stop for approval.')
    await session.resolve({
      resume: [{ interruptId, status: 'resolved', payload: true }],
      inputId: 'approve',
    })
    expect(await session.settled({ inputId: 'approve' })).toMatchObject({
      outcome: 'failed',
    })
    await first.close()

    // A new host on the same storage, like a restart.
    const second = createHarnessHost({ persistence })
    const reopened = await second.open(harness, { threadId: 't1' })
    expect(turnInterrupts(reopened.snapshot())).toEqual([])
    expect(
      await reopened.resolve({
        resume: [{ interruptId, status: 'resolved', payload: true }],
      }),
    ).toMatchObject({ status: 'rejected', reason: 'no_pending_interrupts' })
    expect(execute).toHaveBeenCalledTimes(1)
    await second.close()
  })

  it('accepts a resolve sent on RUN_FINISHED, while the interrupted turn still ends', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({ env: z.string() }),
    }).server(execute)
    // A run plugin whose cleanup waits, so the turn is still active after RUN_FINISHED.
    const cleanup = gate()
    const release = gate()
    const slowCleanup = definePlugin({
      name: 'test/slow-cleanup',
      lifetime: 'turn',
      setup: async (ctx) => {
        await ctx.resources.acquire(
          () => undefined,
          async () => {
            cleanup.open()
            await release.opened
          },
        )
      },
    })
    const { adapter, calls } = mockAdapter([
      () => toolCall('deploy', { env: 'prod' }),
      () => text('Deployed.'),
    ])
    const host = createHarnessHost({ persistence: persistenceFor() })
    const session = await host.open(
      defineHarness({
        name: 'test/resolve-on-finished',
        adapter,
        tools: [deploy],
        plugins: () => [slowCleanup],
      }),
      {
        threadId: 't1',
      },
    )

    const turn = session.send('Deploy.')
    let interruptId = ''
    for await (const { operationId, event } of session.events()) {
      if (operationId !== turn.id) continue
      if (
        event.type === EventType.RUN_FINISHED &&
        event.outcome?.type === 'interrupt'
      ) {
        interruptId = event.outcome.interrupts[0]?.id ?? ''
        break
      }
    }
    await cleanup.opened
    expect(turnInterrupts(session.snapshot())).toMatchObject([
      { id: interruptId },
    ])
    const receipt = await session.resolve({
      resume: [{ interruptId, status: 'resolved', payload: true }],
      inputId: 'approve',
    })
    expect(receipt.status).toBe('accepted')
    release.open()

    expect((await turn).interrupts).toHaveLength(1)
    expect(await session.settled({ inputId: 'approve' })).toMatchObject({
      outcome: 'completed',
      operationId: receipt.operationId,
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
    expect(session.snapshot()).toMatchObject({
      status: 'idle',
      pendingWaits: [],
    })
    await host.close()
  })
})

describe('a resolve and a waiting steer', () => {
  it('runs the resolve before a steer that the interrupted turn never reached', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({ env: z.string() }),
    }).server(execute)
    const held = gate()
    const cleanup = gate()
    const release = gate()
    const slowCleanup = definePlugin({
      name: 'test/slow-cleanup',
      lifetime: 'turn',
      setup: async (ctx) => {
        await ctx.resources.acquire(
          () => undefined,
          async () => {
            cleanup.open()
            await release.opened
          },
        )
      },
    })
    const { adapter, calls } = mockAdapter([
      () =>
        (async function* () {
          await held.opened
          yield* toolCall('deploy', { env: 'prod' })
        })(),
      () => text('Deployed.'),
      () => text('Steered.'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/resolve-before-steer',
        adapter,
        tools: [deploy],
        plugins: () => [slowCleanup],
      }),
      {
        threadId: 't1',
      },
    )

    const turn = session.send('Deploy.')
    await waitFor(() => expect(calls).toHaveLength(1))
    const steer = session.send('And tell me.', {
      busy: 'steer',
      inputId: 'steer',
    })
    await steer.receipt
    held.open()
    await cleanup.opened
    const interruptId = turnInterrupts(session.snapshot())[0]?.id ?? ''
    await session.resolve({
      resume: [{ interruptId, status: 'resolved', payload: true }],
      inputId: 'approve',
    })
    release.open()

    await turn
    expect(await session.settled({ inputId: 'approve' })).toMatchObject({
      outcome: 'completed',
    })
    expect(await steer).toEqual({ text: 'Steered.', media: [] })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(messageTexts(calls[2]).at(-1)).toBe('And tell me.')
    await host.close()
  })
})

describe("prompt({ busy: 'steer' })", () => {
  it('answers with the running turn, which the prompt joins', async () => {
    const first = gate()
    const { adapter, calls } = mockAdapter([
      after(first.opened, 'First.'),
      () => text('Second.'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({ name: 'test/steer-receipt', adapter }),
      {
        threadId: 't1',
      },
    )

    const turn = session.send('Start.')
    await waitFor(() => expect(calls).toHaveLength(1))
    const joined = session.send('Steer by prompt.', {
      busy: 'steer',
      inputId: 'by-prompt',
    })
    const receipt = await joined.receipt
    expect(receipt).toEqual({
      inputId: 'by-prompt',
      status: 'accepted',
      operationId: turn.id,
    })
    expect(session.operation(turn.id)).toBe(turn)
    first.open()

    const result = await turn
    expect(result.text).toBe('First.Second.')
    expect(await joined).toEqual(result)
    expect(await session.settled({ inputId: 'by-prompt' })).toMatchObject({
      outcome: 'completed',
      operationId: turn.id,
    })
    await host.close()
  })
})
