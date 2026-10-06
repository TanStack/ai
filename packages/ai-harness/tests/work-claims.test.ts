import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { after, gate, mockAdapter, text, toolCall } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { WorkClaimStore } from '@tanstack/ai-persistence'
import type { Reply } from './helpers'

const THREAD = 't1'
const NAME = 'test/work-claims'
const later = () => Date.now() + 60 * 60_000

/** A durable host's stores, with work claims. */
function durablePersistence() {
  const { runs, metadata, workClaims } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), runs, metadata, workClaims } }
}

/** A reply that waits for `until`, then calls the tool `name`. */
function toolCallAfter(
  until: Promise<void>,
  name: string,
  args: Record<string, unknown>,
): Reply {
  return () =>
    (async function* (): AsyncGenerator<StreamChunk> {
      await until
      yield* toolCall(name, args)
    })()
}

/** Can another host claim the thread now? It takes the thread when it can. */
const otherHostCanClaim = (claims: WorkClaimStore, threadId = THREAD) =>
  claims.claim({
    threadId,
    harness: NAME,
    ownerId: 'other-host',
    until: later(),
  })

describe('work claims while a session runs', () => {
  it('claims a busy thread for its host, and gives it back when the thread is idle', async () => {
    const persistence = durablePersistence()
    const claims = persistence.stores.workClaims
    const release = gate()
    const { adapter } = mockAdapter([after(release.opened, 'Done.')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(defineHarness({ name: NAME, adapter }), {
      threadId: THREAD,
    })

    const turn = session.prompt('Go.')
    await turn.receipt
    expect(await otherHostCanClaim(claims)).toBe(false)

    release.open()
    await turn
    await vi.waitFor(async () =>
      expect(await otherHostCanClaim(claims)).toBe(true),
    )
    await host.close()
  })

  it('gives the claim back when a turn stops for an approval', async () => {
    const persistence = durablePersistence()
    const claims = persistence.stores.workClaims
    const reply = gate()
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({ env: z.string() }),
    }).server(async () => ({ ok: true }))
    const { adapter } = mockAdapter([
      toolCallAfter(reply.opened, 'deploy', { env: 'prod' }),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: NAME, adapter, tools: [deploy] }),
      { threadId: THREAD },
    )

    const turn = session.prompt('Deploy.')
    await turn.receipt
    expect(await otherHostCanClaim(claims)).toBe(false)

    reply.open()
    expect((await turn).interrupts).toHaveLength(1)
    // The thread waits for a human: it is idle, so a sweep never lists it.
    await vi.waitFor(async () =>
      expect(await claims.listExpired({ now: later() })).toEqual([]),
    )
    await host.close()
  })

  it('keeps the thread busy while a background agent runs', async () => {
    const persistence = durablePersistence()
    const claims = persistence.stores.workClaims
    const finish = gate()
    const waiter = defineAgent({
      name: 'waiter',
      description: 'Waits until it is told to finish',
      run: async () => {
        await finish.opened
        return 'done'
      },
    })
    const { adapter } = mockAdapter([() => text('Noted.')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: NAME, adapter, agents: [waiter] }),
      { threadId: THREAD },
    )

    const run = session.agents.waiter.start(undefined)
    await vi.waitFor(async () =>
      expect(await otherHostCanClaim(claims)).toBe(false),
    )

    finish.open()
    await run
    await vi.waitFor(async () =>
      expect(await otherHostCanClaim(claims)).toBe(true),
    )
    await host.close()
  })

  it('runs and settles the input when the claim store throws, with a warning', async () => {
    const persistence = durablePersistence()
    const claims = persistence.stores.workClaims
    vi.spyOn(claims, 'claim').mockRejectedValue(new Error('claim failed'))
    vi.spyOn(claims, 'release').mockRejectedValue(new Error('release failed'))
    const { adapter } = mockAdapter([() => text('Done.')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(defineHarness({ name: NAME, adapter }), {
      threadId: THREAD,
    })
    const warnings: Array<unknown> = []
    const controller = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({ signal: controller.signal })) {
        if (
          entry.event.type === EventType.CUSTOM &&
          entry.event.name === 'harness.plugin.warning'
        ) {
          warnings.push(entry.event.value)
        }
      }
    })()

    const turn = session.prompt('Go.')
    const { inputId } = await turn.receipt
    expect((await turn).text).toBe('Done.')
    expect(await session.settled(inputId)).toMatchObject({
      outcome: 'completed',
    })
    // The failed writes are warnings: one for the claim, one for the release.
    await vi.waitFor(() =>
      expect(warnings).toEqual(
        expect.arrayContaining([
          { plugin: 'harness:work-claims', message: 'claim failed' },
          { plugin: 'harness:work-claims', message: 'release failed' },
        ]),
      ),
    )
    controller.abort()
    await reading
    await host.close()
  })
})
