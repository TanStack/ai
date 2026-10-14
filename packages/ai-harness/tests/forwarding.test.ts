import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { after, gate, mockAdapter, text } from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'

const THREAD = 't1'
const NAME = 'test/forwarding'

/** Stores that several hosts share, as on a serverless platform. */
function sharedStores(options: { inbox?: boolean } = {}) {
  const { runs, metadata, workClaims, inbox } = memoryPersistence().stores
  return {
    stores: {
      log: memoryLogStore(),
      runs,
      metadata,
      workClaims,
      ...(options.inbox === false ? {} : { inbox }),
    },
  }
}

const harnessOf = (adapter: AnyTextAdapter) =>
  defineHarness({ name: NAME, adapter })

describe('an input that reaches a host that does not own the thread', () => {
  it('waits in the inbox for the owner, and the owner turn goes on', async () => {
    const persistence = sharedStores()
    const release = gate()
    const { adapter, calls } = mockAdapter([
      after(release.opened, 'One.'),
      () => text('Two.'),
    ])
    const harness = harnessOf(adapter)
    const owner = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })
    const other = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })

    const turn = owner.prompt('Go.')
    await turn.receipt
    const receipt = await other.followUp('And then?')
    expect(receipt.status).toBe('queued')

    release.open()
    expect((await turn).text).toBe('One.')
    // The owner applied the follow-up, and both hosts read how it ended.
    // The owner reads the inbox within a second.
    const settled = await vi.waitFor(() => owner.settled(receipt.inputId), {
      timeout: 3_000,
    })
    expect(settled.outcome).toBe('completed')
    expect((await other.settled(receipt.inputId)).outcome).toBe('completed')
    expect(calls).toHaveLength(2)
    expect(await owner.transcript()).toMatchObject([
      { role: 'user', content: 'Go.' },
      { role: 'assistant', content: 'One.' },
      { role: 'user', content: 'And then?' },
      { role: 'assistant', content: 'Two.' },
    ])
  })

  it('streams a forwarded turn under its run id on the host that took it', async () => {
    const persistence = sharedStores()
    const release = gate()
    const { adapter } = mockAdapter([
      after(release.opened, 'One.'),
      () => text('Two.'),
    ])
    const harness = harnessOf(adapter)
    const owner = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })
    const other = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })

    const first = owner.prompt('Go.')
    await first.receipt
    // A `POST run` on the other host: the turn runs on the owner as `run-2`.
    const second = other.prompt('And then?', { runId: 'run-2' })
    expect((await second.receipt).status).toBe('queued')
    release.open()
    const texts: Array<string> = []
    for await (const event of second.stream()) {
      if (event.type === EventType.TEXT_MESSAGE_CONTENT) texts.push(event.delta)
    }
    expect(texts.join('')).toBe('Two.')
    expect((await second).text).toBe('Two.')
  })

  it('is refused without an inbox, and the owner turn goes on', async () => {
    const persistence = sharedStores({ inbox: false })
    const release = gate()
    const { adapter } = mockAdapter([after(release.opened, 'One.')])
    const harness = harnessOf(adapter)
    const owner = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })
    const other = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })

    const turn = owner.prompt('Go.')
    await turn.receipt
    expect(await other.steer('Faster.')).toMatchObject({
      status: 'rejected',
      reason: 'owned_elsewhere',
    })

    release.open()
    expect((await turn).text).toBe('One.')
  })

  it('runs on the next host that opens the thread after the owner stopped', async () => {
    const persistence = sharedStores()
    const { adapter, calls } = mockAdapter([() => text('Picked up.')])
    const harness = harnessOf(adapter)
    // A host that stopped holds a claim that is about to expire.
    await persistence.stores.workClaims.claim({
      threadId: THREAD,
      harness: NAME,
      ownerId: 'stopped-host',
      until: Date.now() + 50,
    })
    const first = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })
    const receipt = await first.followUp('Still there?')
    expect(receipt.status).toBe('queued')
    expect(calls).toHaveLength(0)

    await new Promise((resolve) => setTimeout(resolve, 80))
    const host = createHarnessHost({ persistence })
    await host.resumePending({ harnesses: [harness] })
    const next = await host.open(harness, { threadId: THREAD })
    const settled = await vi.waitFor(() => next.settled(receipt.inputId), {
      timeout: 3_000,
    })
    expect(settled.outcome).toBe('completed')
    expect(calls).toHaveLength(1)
  })

  it('leaves the input of a live owner alone when another host opens the thread', async () => {
    const persistence = sharedStores()
    const { adapter, calls } = mockAdapter([() => text('One.')])
    const harness = harnessOf(adapter)
    // The owner stores the input, then waits before it writes its run lease.
    const leaseWrite = gate()
    const shared = persistence.stores.runs
    const owner = await createHarnessHost({
      persistence: {
        stores: {
          ...persistence.stores,
          runs: Object.assign(Object.create(persistence.stores.runs), {
            createOrResume: async (
              ...args: Parameters<typeof shared.createOrResume>
            ) => {
              await leaseWrite.opened
              return shared.createOrResume(...args)
            },
          }),
        },
      },
    }).open(harness, { threadId: THREAD })
    const turn = owner.prompt('Go.')
    await turn.receipt

    // In that window, another host opens the thread and finds the input.
    const other = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })
    leaseWrite.open()
    expect((await turn).text).toBe('One.')
    expect(calls).toHaveLength(1)
    await other.close()
  })

  it('answers a question that waits on another host', async () => {
    const persistence = sharedStores()
    const deploy = definePlugin({
      name: 'test/deploy',
      setup: () => ({
        commands: {
          deploy: defineCommand({
            description: 'Deploy after a confirmation',
            run: async (_input, ctx) => {
              const sure = await ctx.session.ask({
                message: 'Deploy to production?',
                schema: z.boolean(),
              })
              return sure ? 'deployed' : 'skipped'
            },
          }),
        },
      }),
    })
    const { adapter } = mockAdapter([])
    const harness = defineHarness({
      name: NAME,
      adapter,
      plugins: () => [deploy],
    })
    const owner = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })
    const other = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })

    const running = owner.command('deploy')
    await vi.waitFor(() =>
      expect(owner.snapshot().pendingQuestions).toHaveLength(1),
    )
    const [question] = owner.snapshot().pendingQuestions
    expect(
      await other.answer({ questionId: question!.questionId, value: true }),
    ).toMatchObject({
      status: 'queued',
    })
    expect(await running).toBe('deployed')
  })
})
