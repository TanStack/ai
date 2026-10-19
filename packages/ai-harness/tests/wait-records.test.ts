import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import {
  memoryLogBackend,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import {
  AccessDeniedError,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  logIdOf,
  membersOnly,
} from '../src'
import {
  CRASHING_OWNERSHIP,
  canOtherHostTake,
  gate,
  mockAdapter,
  ownershipExpired,
  storedThreadState,
  text,
  toolCall,
} from './helpers'
import type { LogStore } from '@tanstack/ai-persistence'
import type { CredentialStore } from '@tanstack/ai/byok'
import type { HarnessHostOptions, HarnessSession, Wait } from '../src'
import type { Reply } from './helpers'
import type { SessionImpl } from '../src/session/harness-session'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 't1'
const NAME = 'test/wait-records'

/** The signal of the `stoppable` command. The test aborts it. */
let stopAsk = new AbortController()

/**
 * Commands that ask: plainly, with a short expiry, and with a signal. Each
 * asks in a live wait of its own run, as an MCP elicitation does, so the
 * question is a wait of the command run that a promise of this host holds.
 */
const asker = definePlugin({
  name: 'test/asker',
  setup: () => ({
    commands: {
      ask: defineCommand({
        description: 'Ask for a name',
        run: (_input, ctx) =>
          ctx.session.ask({
            message: 'Name?',
            schema: z.string(),
            live: { name: 'mcp-elicitation', run: ctx.run },
          }),
      }),
      soon: defineCommand({
        description: 'Ask for a password that expires soon',
        run: (_input, ctx) =>
          ctx.session.ask({
            message: 'Password?',
            secret: true,
            expiresAt: Date.now() + 150,
            live: { name: 'mcp-elicitation', run: ctx.run },
          }),
      }),
      stoppable: defineCommand({
        description: 'Ask until the signal aborts',
        run: (_input, ctx) =>
          ctx.session.ask({
            message: 'Still there?',
            signal: stopAsk.signal,
            live: { name: 'mcp-elicitation', run: ctx.run },
          }),
      }),
    },
  }),
})

const remove = toolDefinition({
  name: 'remove',
  description: 'Remove a file. Needs approval.',
  needsApproval: true,
  inputSchema: z.object({ path: z.string() }),
}).server(() => Promise.resolve({ removed: true }))

function harnessWith(replies: Array<Reply> | Reply = () => text('ok')) {
  return defineHarness({
    name: NAME,
    adapter: mockAdapter(replies).adapter,
    plugins: () => [asker],
    tools: [remove],
  })
}

/** A host with a log store, and the session of `THREAD`. */
async function hostOn(
  log: LogStore,
  options: Omit<HarnessHostOptions, 'persistence'> = {},
  replies?: Array<Reply> | Reply,
) {
  const host = createHarnessHost({
    persistence: { stores: { log } },
    ...options,
  })
  const session = await host.open(harnessWith(replies), { threadId: THREAD })
  return { host, session }
}

/** The waits that the log of `THREAD` keeps, as a new host folds them. */
const storedWaits = async (log: LogStore) =>
  (await storedThreadState(log, { threadId: THREAD })).waits

/** Ask with the command `name`. Resolves with its operation and its wait. */
async function asked(session: HarnessSession, name: string) {
  const running = session.command({ name })
  running.then(
    () => {},
    () => {},
  )
  await waitFor(() => expect(session.snapshot().pendingWaits).toHaveLength(1))
  const [wait] = session.snapshot().pendingWaits ?? []
  return { running, wait: wait! }
}

describe('a question is a wait in the log', () => {
  it('opens a wait of the run that asks, and an answer ends it', async () => {
    const log = memoryLogStore()
    const { host, session } = await hostOn(log)

    const { running, wait } = await asked(session, 'ask')
    expect(wait).toEqual({
      waitId: session.snapshot().pendingQuestions[0]?.questionId,
      kind: 'question',
      runId: running.id,
      schema: { type: 'string' },
      message: 'Name?',
    })
    await waitFor(async () =>
      expect((await storedWaits(log)).get(wait.waitId)).toMatchObject({
        wait,
        live: true,
      }),
    )

    await session.answer({ questionId: wait.waitId, value: 'Ada' })
    expect(await running).toBe('Ada')
    expect(session.snapshot().pendingWaits).toEqual([])
    expect(session.snapshot().pendingQuestions).toEqual([])
    await waitFor(async () =>
      expect((await storedWaits(log)).get(wait.waitId)).toMatchObject({
        outcome: 'answered',
      }),
    )
    await host.close()
  })

  it('shows on another host that reads the log', async () => {
    const backend = memoryLogBackend()
    const owner = await hostOn(memoryLogStore({ backend }))
    const reader = createHarnessHost({
      persistence: { stores: { log: memoryLogStore({ backend }) } },
    })

    const { running, wait } = await asked(owner.session, 'ask')
    const view = await reader.observe(harnessWith(), { threadId: THREAD })
    await waitFor(async () =>
      expect((await view.snapshot()).pendingWaits).toEqual([wait]),
    )
    expect((await view.snapshot()).pendingQuestions).toEqual([
      { questionId: wait.waitId, message: 'Name?', schema: { type: 'string' } },
    ])

    await owner.session.answer({ questionId: wait.waitId, value: 'Ada' })
    expect(await running).toBe('Ada')
    await waitFor(async () =>
      expect((await view.snapshot()).pendingWaits).toEqual([]),
    )
    await owner.host.close()
    await reader.close()
  })

  it('ends cancelled when the command that asks is cancelled', async () => {
    const log = memoryLogStore()
    const { host, session } = await hostOn(log)

    const { running, wait } = await asked(session, 'ask')
    await running.cancel()
    await expect(running).rejects.toBeDefined()
    expect(session.snapshot().pendingWaits).toEqual([])
    await waitFor(async () =>
      expect((await storedWaits(log)).get(wait.waitId)).toMatchObject({
        outcome: 'cancelled',
      }),
    )
    await host.close()
  })

  it('ends cancelled when the signal of the ask aborts', async () => {
    stopAsk = new AbortController()
    const log = memoryLogStore()
    const { host, session } = await hostOn(log)

    const { running, wait } = await asked(session, 'stoppable')
    stopAsk.abort(new Error('The user left.'))
    await expect(running).rejects.toThrow('The user left.')
    expect(session.snapshot().pendingWaits).toEqual([])
    await waitFor(async () =>
      expect((await storedWaits(log)).get(wait.waitId)).toMatchObject({
        outcome: 'cancelled',
      }),
    )
    await host.close()
  })

  it('ends cancelled on the next owner when the host that asked stopped', async () => {
    const backend = memoryLogBackend()
    const log = memoryLogStore({ backend })
    // The first host never renews its ownership, as after a crash.
    const first = await hostOn(log, { ownership: CRASHING_OWNERSHIP })
    const { wait } = await asked(first.session, 'ask')
    await waitFor(async () =>
      expect((await storedWaits(log)).get(wait.waitId)).toBeDefined(),
    )

    await ownershipExpired()
    // No promise of this host holds the question: no answer can reach it.
    const next = await hostOn(memoryLogStore({ backend }))
    await waitFor(() =>
      expect(next.session.snapshot().pendingQuestions).toEqual([]),
    )
    await waitFor(async () =>
      expect((await storedWaits(log)).get(wait.waitId)).toMatchObject({
        outcome: 'cancelled',
      }),
    )
    await next.host.close()
    await first.host.close()
  })
})

describe('a wait that expires', () => {
  it('ends expired at its time, and its ask rejects', async () => {
    const log = memoryLogStore()
    const { host, session } = await hostOn(log)

    const { running, wait } = await asked(session, 'soon')
    expect(wait.expiresAt).toBeTypeOf('number')
    await expect(running).rejects.toThrow('expired')
    expect(session.snapshot().pendingWaits).toEqual([])
    const stored = await storedThreadState(log, { threadId: THREAD })
    expect(stored.waits.get(wait.waitId)).toMatchObject({ outcome: 'expired' })
    // The wake of the expiry ran.
    expect([...stored.schedules.keys()]).toEqual([])
    await host.close()
  })

  it('deletes the secret answers to it that nobody read', async () => {
    const credentials: CredentialStore = memoryCredentialStore()
    const { host, session } = await hostOn(memoryLogStore(), { credentials })
    const scope = { threadId: THREAD }
    const credential = { type: 'api_key' as const, value: '"hunter2"' }

    const { running, wait } = await asked(session, 'soon')
    // A host saved an answer for the owner, then stopped before it offered it.
    const lost = `harness:answer:${wait.waitId}:lost`
    const other = 'harness:answer:q-other:in-1'
    await credentials.set({ scope, id: lost, credential })
    await credentials.set({ scope, id: other, credential })

    await expect(running).rejects.toThrow('expired')
    await waitFor(async () =>
      expect(await credentials.get({ scope, id: lost })).toBeNull(),
    )
    // The answer to another wait stays.
    expect(await credentials.get({ scope, id: other })).toEqual(credential)
    await host.close()
  })
})

describe('session.settled', () => {
  it('rejects with the reason of the signal when it aborts first', async () => {
    const release = gate()
    const { host, session } = await hostOn(memoryLogStore(), {}, [
      async function* () {
        await release.opened
        yield* text('done')
      },
    ])
    const turn = session.send('Go.', { inputId: 'slow' })
    await turn.receipt

    const stop = new AbortController()
    const settling = session.settled({ inputId: 'slow', signal: stop.signal })
    stop.abort(new Error('Gave up.'))
    await expect(settling).rejects.toThrow('Gave up.')

    release.open()
    expect(await session.settled({ inputId: 'slow' })).toMatchObject({
      outcome: 'completed',
    })
    await host.close()
  })
})

describe('session.waitFor', () => {
  it('resolves with the wait of the run, now or when it opens', async () => {
    const { host, session } = await hostOn(memoryLogStore(), {}, [
      () => toolCall('remove', { path: 'a.txt' }),
    ])

    const turn = session.send('Remove a.txt.')
    const approval = await session.waitFor({ runId: turn.id })
    expect(approval).toMatchObject({ kind: 'approval', runId: turn.id })
    expect((await turn).interrupts?.[0]?.id).toBe(approval.waitId)
    // Open now: it resolves at once.
    expect(await session.waitFor()).toEqual(approval)
    await host.close()
  })

  it('rejects with the reason of the signal, and when the session closes', async () => {
    const { host, session } = await hostOn(memoryLogStore())
    const stop = new AbortController()
    const waiting = session.waitFor({
      runId: 'no-such-run',
      signal: stop.signal,
    })
    stop.abort(new Error('No wait.'))
    await expect(waiting).rejects.toThrow('No wait.')

    const forever = session.waitFor({ runId: 'no-such-run' })
    await host.close()
    await expect(forever).rejects.toThrow('Session closed.')
  })
})

interface User {
  id: string
  tenantId: string
}
const olga: User = { id: 'olga', tenantId: 'acme' }
const bea: User = { id: 'bea', tenantId: 'acme' }
const vic: User = { id: 'vic', tenantId: 'acme' }
const oto: User = { id: 'oto', tenantId: 'acme' }

describe('a human wait', () => {
  /**
   * A host with access, where olga owns `THREAD`, bea is a member, vic a
   * viewer, and oto an operator.
   */
  async function sharedThread() {
    const persistence = memoryPersistence()
    const host = createHarnessHost({
      persistence,
      access: { identify: (): User | null => null, authorize: membersOnly() },
    })
    const harness = harnessWith()
    const open = (principal: User) =>
      host.open(harness, { threadId: THREAD, principal })
    const owner = await open(olga)
    for (const [userId, role] of [
      ['bea', 'member'],
      ['vic', 'viewer'],
      ['oto', 'operator'],
    ] as const) {
      await host.sessions.share({
        threadId: THREAD,
        userId,
        role,
        principal: olga,
      })
    }
    return { host, persistence, log: persistence.stores.log, owner, open }
  }

  /** `openWait` of the session: no public method opens a human wait yet. */
  const openWait = (session: HarnessSession, wait: Omit<Wait, 'waitId'>) =>
    (session as unknown as SessionImpl).openWait(wait)

  it('leaves the session idle and the log free while it waits', async () => {
    const { host, log, owner } = await sharedThread()
    const wait = await openWait(owner, {
      kind: 'human',
      runId: 'run-1',
      principal: olga,
      message: 'A person takes over.',
    })
    expect(owner.snapshot().pendingWaits).toEqual([wait])
    await waitFor(async () =>
      expect(
        await canOtherHostTake(
          log,
          logIdOf({ tenantId: 'acme', logId: THREAD }),
        ),
      ).toBe(true),
    )
    await owner.whenIdle({ signal: AbortSignal.timeout(5_000) })
    await host.close()
  })

  it('takes the answer of an operator, and refuses the owner, a member, and a viewer', async () => {
    const { host, log, owner, open } = await sharedThread()
    const wait = await openWait(owner, {
      kind: 'human',
      runId: 'run-1',
      principal: olga,
    })
    const operator = await open(oto)
    const answer = { questionId: wait.waitId, value: { resume: true } }

    // The owner started the run, but waits for a person: not one by default.
    for (const user of [olga, bea, vic]) {
      await expect((await open(user)).answer(answer)).rejects.toBeInstanceOf(
        AccessDeniedError,
      )
    }
    await expect(
      owner.resolve({
        resume: [{ interruptId: wait.waitId, status: 'cancelled' }],
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    expect(await operator.answer(answer)).toMatchObject({ status: 'accepted' })
    expect(owner.snapshot().pendingWaits).toEqual([])
    const stored = await storedThreadState(log, {
      threadId: THREAD,
      tenantId: 'acme',
    })
    expect(stored.waits.get(wait.waitId)).toMatchObject({
      outcome: 'answered',
      value: { resume: true },
    })
    // A wait ends once.
    expect(await operator.answer(answer)).toMatchObject({
      status: 'rejected',
      reason: 'unknown_question',
    })
    await host.close()
  })

  it('takes the answer of an operator through host.submit too', async () => {
    const { host, persistence, owner } = await sharedThread()
    const wait = await openWait(owner, {
      kind: 'human',
      runId: 'run-1',
      principal: olga,
    })
    // Another host that does not own the log.
    const submitter = createHarnessHost({
      persistence,
      access: { identify: (): User | null => null, authorize: membersOnly() },
    })
    const submit = (principal: User) =>
      submitter.submit({
        harness: harnessWith(),
        threadId: THREAD,
        principal,
        input: {
          op: 'answer',
          questionId: wait.waitId,
          value: { resume: true },
        },
      })

    await expect(submit(vic)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(submit(olga)).rejects.toBeInstanceOf(AccessDeniedError)
    expect(await submit(oto)).toMatchObject({ status: 'queued' })
    // The wait left the log free: a sweep runs the answer.
    await host.resumePending({ harnesses: [harnessWith()] })
    await waitFor(() => expect(owner.snapshot().pendingWaits).toEqual([]))
    await submitter.close()
    await host.close()
  })

  it('refuses a member for a question of a run that the member did not start', async () => {
    const { host, owner, open } = await sharedThread()
    const wait = await openWait(owner, {
      kind: 'question',
      runId: 'run-1',
      principal: olga,
    })
    const member = await open(bea)
    await expect(
      member.answer({ questionId: wait.waitId, value: 'yes' }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    await host.close()
  })
})
