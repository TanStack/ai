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
} from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { Reply } from './helpers'

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

/** The stores of a host without a log, or of a durable host. */
function persistenceFor(durable: boolean) {
  const { stores } = memoryPersistence()
  if (!durable) return { stores }
  const { runs, metadata } = stores
  return { stores: { log: memoryLogStore(), runs, metadata } }
}

describe.each([
  { host: 'a host without a log', durable: false },
  { host: 'a durable host', durable: true },
])('resolve on $host', ({ durable }) => {
  it('keeps the interrupt when the resume fails validation, so a correct resolve continues the turn', async () => {
    const { adapter, calls } = mockAdapter([
      () => toolCall('openScreen', { route: '/settings' }),
      () => text('Opened it.'),
    ])
    const host = createHarnessHost({ persistence: persistenceFor(durable) })
    const session = await host.open(
      defineHarness({ name: 'test/bad-resume', adapter, tools: [openScreen] }),
      { threadId: 't1' },
    )
    const turn = await session.prompt('Open settings.')
    const interruptId = turn.interrupts?.[0]?.id
    if (!interruptId) throw new Error('The turn did not stop for the tool.')

    // A client tool needs a result, not `true`.
    await session.resolve(
      [{ interruptId, status: 'resolved', payload: true }],
      {
        inputId: 'wrong',
      },
    )
    expect(await session.settled('wrong')).toMatchObject({ outcome: 'failed' })
    expect(session.snapshot()).toMatchObject({
      status: 'requires_action',
      pendingInterrupts: [{ id: interruptId }],
    })

    const right = await session.resolve(
      [{ interruptId, status: 'resolved', payload: { opened: true } }],
      { inputId: 'right' },
    )
    expect(right.status).toBe('accepted')
    expect(await session.settled('right')).toMatchObject({
      outcome: 'completed',
    })
    expect(calls).toHaveLength(2)
    expect(session.snapshot().pendingInterrupts).toEqual([])
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
    const persistence = persistenceFor(durable)
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
    ).prompt('Probe.', { context: { screen: 'settings' } })
    const interruptId = turn.interrupts?.[0]?.id
    if (!interruptId) throw new Error('The turn did not stop for the approval.')
    await first.host.close()

    const second = open([() => text('Done.')])
    const session = await second.session
    await session.resolve(
      [{ interruptId, status: 'resolved', payload: true }],
      { inputId: 'approve' },
    )
    expect(await session.settled('approve')).toMatchObject({
      outcome: 'completed',
    })
    expect(seen).toEqual([
      { screen: 'settings', threadId: 't1', runId: expect.any(String) },
    ])
    await second.host.close()
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
    const host = createHarnessHost({ persistence: persistenceFor(durable) })
    const session = await host.open(
      defineHarness({ name: 'test/late-failure', adapter, tools: [deploy] }),
      { threadId: 't1' },
    )
    const turn = await session.prompt('Deploy.')
    const interruptId = turn.interrupts?.[0]?.id
    if (!interruptId) throw new Error('The turn did not stop for approval.')

    await session.resolve(
      [{ interruptId, status: 'resolved', payload: true }],
      {
        inputId: 'approve',
      },
    )
    expect(await session.settled('approve')).toMatchObject({
      outcome: 'failed',
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(session.snapshot().pendingInterrupts).toEqual([])
    expect(
      await session.resolve([
        { interruptId, status: 'resolved', payload: true },
      ]),
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
    const persistence = persistenceFor(durable)
    const first = createHarnessHost({ persistence })
    const session = await first.open(harness, { threadId: 't1' })
    const turn = await session.prompt('Deploy.')
    const interruptId = turn.interrupts?.[0]?.id
    if (!interruptId) throw new Error('The turn did not stop for approval.')
    await session.resolve(
      [{ interruptId, status: 'resolved', payload: true }],
      { inputId: 'approve' },
    )
    expect(await session.settled('approve')).toMatchObject({
      outcome: 'failed',
    })
    await first.close()

    // A new host on the same storage, like a restart.
    const second = createHarnessHost({ persistence })
    const reopened = await second.open(harness, { threadId: 't1' })
    expect(reopened.snapshot().pendingInterrupts).toEqual([])
    expect(
      await reopened.resolve([
        { interruptId, status: 'resolved', payload: true },
      ]),
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
    const host = createHarnessHost({ persistence: persistenceFor(durable) })
    const session = await host.open(
      defineHarness({
        name: 'test/resolve-on-finished',
        adapter,
        tools: [deploy],
        plugins: () => [slowCleanup],
      }),
      { threadId: 't1' },
    )

    const turn = session.prompt('Deploy.')
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
    expect(session.snapshot().pendingInterrupts).toMatchObject([
      { id: interruptId },
    ])
    const receipt = await session.resolve(
      [{ interruptId, status: 'resolved', payload: true }],
      { inputId: 'approve' },
    )
    expect(receipt.status).toBe('accepted')
    release.open()

    expect((await turn).interrupts).toHaveLength(1)
    expect(await session.settled('approve')).toMatchObject({
      outcome: 'completed',
      operationId: receipt.operationId,
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
    expect(session.snapshot()).toMatchObject({
      status: 'idle',
      pendingInterrupts: [],
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
      { threadId: 't1' },
    )

    const turn = session.prompt('Deploy.')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    const steer = session.prompt('And tell me.', {
      busy: 'steer',
      inputId: 'steer',
    })
    await steer.receipt
    held.open()
    await cleanup.opened
    const interruptId = session.snapshot().pendingInterrupts[0]?.id ?? ''
    await session.resolve(
      [{ interruptId, status: 'resolved', payload: true }],
      { inputId: 'approve' },
    )
    release.open()

    await turn
    expect(await session.settled('approve')).toMatchObject({
      outcome: 'completed',
    })
    expect(await steer).toEqual({ text: 'Steered.' })
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
      { threadId: 't1' },
    )

    const turn = session.prompt('Start.')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    const joined = session.prompt('Steer by prompt.', {
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
    expect(await session.settled('by-prompt')).toMatchObject({
      outcome: 'completed',
      operationId: turn.id,
    })
    await host.close()
  })
})
