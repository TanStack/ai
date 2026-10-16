import { describe, expect, it } from 'vitest'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, harnessOf } from '../src'
import { after, gate, mockAdapter } from './helpers'
import type { Reply } from './helpers'

/** Open a session whose model calls answer with `replies`. */
async function open(replies: Array<Reply> = []) {
  const { adapter } = mockAdapter(replies)
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open({
    harness: defineHarness({ name: 'test/session-surface', adapter }),
    threadId: 't1',
  })
  return { host, session }
}

/** A session with one turn that runs until `release` opens. */
async function openBusy() {
  const release = gate()
  const { host, session } = await open([after(release.opened, 'Done.')])
  const turn = session.send('Hello.')
  await turn.receipt
  return { host, session, turn, release }
}

describe('session.whenIdle', () => {
  it('resolves on an idle session', async () => {
    const { host, session } = await open()

    await expect(session.whenIdle()).resolves.toBeUndefined()
    await host.close()
  })

  it('resolves after the running turn settles', async () => {
    const { host, session, turn, release } = await openBusy()

    const statusWhenIdle = session.whenIdle().then(() => turn.status())
    release.open()

    expect(await statusWhenIdle).toBe('completed')
    await host.close()
  })

  it('rejects at once with the reason of a signal that aborted before the call', async () => {
    const { host, session, turn, release } = await openBusy()
    const reason = new Error('Stop waiting.')

    // The turn waits for `release`, so a wait for idle would never end.
    await expect(
      session.whenIdle({ signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason)
    release.open()
    await turn
    await host.close()
  })

  it('rejects with the reason when the signal aborts during the wait', async () => {
    const { host, session, turn, release } = await openBusy()
    const controller = new AbortController()
    const reason = new Error('Stop waiting.')

    const waiting = session.whenIdle({ signal: controller.signal })
    controller.abort(reason)

    await expect(waiting).rejects.toBe(reason)
    release.open()
    await turn
    await host.close()
  })
})

describe('the HarnessSession type', () => {
  it('does not have the members that only the host and the handler call', async () => {
    const { host, session } = await open()

    // @ts-expect-error `host.open` opens the session.
    void session.open
    // @ts-expect-error `host.fork` adopts the fork.
    void session.adoptFork
    // @ts-expect-error `session.whenIdle` is the public wait.
    void session.onIdle
    // @ts-expect-error the handler resolves a `POST run` as its run id.
    void session.resolveForRun
    const answers: Parameters<typeof session.resolve>[0] = {
      resume: [],
      // @ts-expect-error `resolve` takes no run id.
      runId: 'run-1',
    }
    void answers
    await host.close()
  })
})

describe('harnessOf', () => {
  it('throws a TypeError that names harnessOf outside a harness run', () => {
    const outside = () => harnessOf({})

    expect(outside).toThrow(TypeError)
    expect(outside).toThrow(/^harnessOf: /)
  })

  it('types ctx.harness as possibly undefined in agent code', () => {
    // A type pin: this agent never runs.
    defineAgent({
      name: 'pin',
      description: 'Reads ctx.harness without harnessOf',
      run: async (ctx) => {
        // @ts-expect-error a plain chat() run has no ctx.harness.
        await ctx.harness.step.do('step', async () => 1)
      },
    })
  })
})
