import { describe, expect, it } from 'vitest'
import { chat, defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { after, gate, mockAdapter } from './helpers'
import type { Reply } from './helpers'

/** Open a session whose model calls answer with `replies`. */
async function open(replies: Array<Reply> = []) {
  const { adapter } = mockAdapter(replies)
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({ name: 'test/session-surface', adapter }),
    {
      threadId: 't1',
    },
  )
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
    // @ts-expect-error the handler sends a `POST run` as its run id.
    void session.sendForRun
    const sent: Parameters<typeof session.send>[1] = {
      // @ts-expect-error `send` takes no run id.
      runId: 'run-1',
    }
    void sent
    const config: Parameters<typeof session.setConfig>[0] = {
      key: 'model',
      value: 'fast',
      // @ts-expect-error only an offered input has its own control id.
      inputId: 'in-1',
    }
    void config
    const answer: Parameters<typeof session.answer>[0] = {
      questionId: 'q-1',
      value: 'yes',
      // @ts-expect-error only an offered answer has a secret ref.
      ref: 'harness:answer:q-1:in-1',
    }
    void answer
    await host.close()
  })
})

describe('ctx.harness in a run that a plain chat() starts', () => {
  it('runs step.do each time, and agents.start throws the clear error', async () => {
    const seen: { steps: Array<number>; startError?: unknown } = { steps: [] }
    const probe = defineAgent({
      name: 'probe',
      description: 'Uses ctx.harness with no harness session',
      run: async (ctx) => {
        // No `?` and no @ts-expect-error: `ctx.harness` is always there.
        seen.steps.push(await ctx.harness.step.do('count', () => 1))
        seen.steps.push(await ctx.harness.step.do('count', () => 2))
        try {
          ctx.harness.agents.start('helper')
        } catch (error) {
          seen.startError = error
        }
        return 'done'
      },
    })

    for await (const _chunk of chat({
      adapter: mockAdapter([]).adapter,
      messages: [{ role: 'user', content: 'Go' }],
      subagents: { agents: [probe], router: () => 'probe' },
    })) {
      // drain
    }

    expect(seen.steps).toEqual([1, 2])
    expect(seen.startError).toEqual(
      new Error(
        'ctx.harness.agents needs a run that a harness session started.',
      ),
    )
  })
})
