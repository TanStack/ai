import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent } from '@tanstack/ai'
import { memoryLogBackend, memoryLogStore } from '@tanstack/ai-persistence'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { credentialsFor } from '../src/auth'
import {
  InputRejectedError,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  logIdOf,
} from '../src'
import { createHarnessHandler } from '../src/server'
import {
  after,
  CRASHING_OWNERSHIP,
  gate,
  messageTexts,
  mockAdapter,
  ownershipExpired,
  questionsOf,
  text,
  untilAborted,
  wrapLogStore,
} from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { CredentialStore } from '@tanstack/ai/byok'
import type {
  AnyAgent,
  AnyHarness,
  HarnessHostOptions,
  HarnessSession,
  Receipt,
} from '../src'
import type { SessionImpl } from '../src/session/harness-session'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })
const NAME = 'test/input-lane'

/** Two log stores on one backend: two servers on one database. */
function twoStores() {
  const backend = memoryLogBackend()
  return { a: memoryLogStore({ backend }), b: memoryLogStore({ backend }) }
}

function harnessWith(
  adapter: AnyTextAdapter,
  extra: { agents?: Array<AnyAgent> } = {},
) {
  return defineHarness({ name: NAME, adapter, ...extra })
}

/** A host on `log` with the session of `THREAD` open. */
async function hostOn(
  log: LogStore,
  harness: AnyHarness,
  options: Omit<HarnessHostOptions, 'persistence'> = {},
) {
  const host = createHarnessHost({
    persistence: { stores: { log } },
    ...options,
  })
  const session = await host.open(harness, { threadId: THREAD })
  return { host, session }
}

/** The role and content of each message. */
const contents = (
  messages: ReadonlyArray<{ role: string; content: unknown }>,
) => messages.map(({ role, content }) => ({ role, content }))

/** The input ids that wait in the lane of `THREAD`. */
const waiting = async (log: LogStore) =>
  (await log.offered({ logId: LOG })).map((offer) => offer.inputId)

/** A command that asks for a password, and says if it is right. */
const asking = (secret: boolean) =>
  definePlugin({
    name: 'test/ask',
    setup: () => ({
      commands: {
        ask: defineCommand({
          description: 'Sign in with a password',
          run: async (_input, ctx) => {
            const password = await ctx.step.ask({
              name: 'password',
              message: 'Password?',
              schema: z.string(),
              secret,
            })
            return password === 'hunter2' ? 'signed in' : 'wrong'
          },
        }),
      },
    }),
  })

afterEach(() => {
  vi.useRealTimers()
})

describe('an input that reaches a host that does not own the log', () => {
  it('is queued, and the owner runs it after its turn', async () => {
    const { a, b } = twoStores()
    const release = gate()
    const ownerModel = mockAdapter([
      after(release.opened, 'One.'),
      () => text('Two.'),
    ])
    const otherModel = mockAdapter([() => text('Not here.')])
    const owner = await hostOn(a, harnessWith(ownerModel.adapter))
    const other = await hostOn(b, harnessWith(otherModel.adapter))

    const turn = owner.session.send('Go.')
    await turn.receipt
    const receipt = await other.session.send('And then?', { mode: 'followUp' })
      .receipt
    expect(receipt.status).toBe('queued')

    release.open()
    expect(
      (await other.session.settled({ inputId: receipt.inputId })).outcome,
    ).toBe('completed')
    expect(ownerModel.calls).toHaveLength(2)
    expect(otherModel.calls).toHaveLength(0)
    expect(contents(await owner.session.transcript())).toEqual([
      { role: 'user', content: 'Go.' },
      { role: 'assistant', content: 'One.' },
      { role: 'user', content: 'And then?' },
      { role: 'assistant', content: 'Two.' },
    ])
    expect(await waiting(a)).toEqual([])
    await owner.host.close()
    await other.host.close()
  })

  it('runs once when the host that offered it sends it again with the same id', async () => {
    const { a, b } = twoStores()
    const release = gate()
    const ownerModel = mockAdapter([
      after(release.opened, 'One.'),
      () => text('Two.'),
      () => text('Twice.'),
    ])
    const owner = await hostOn(a, harnessWith(ownerModel.adapter))
    const other = await hostOn(b, harnessWith(mockAdapter([]).adapter))

    const turn = owner.session.send('Go.')
    await turn.receipt
    const first = await other.session.send('Again?', { inputId: 'in-b' })
      .receipt
    const retry = await other.session.send('Again?', { inputId: 'in-b' })
      .receipt
    expect([first.status, retry.status]).toEqual(['queued', 'queued'])

    release.open()
    expect((await other.session.settled({ inputId: 'in-b' })).outcome).toBe(
      'completed',
    )
    expect(ownerModel.calls).toHaveLength(2)
    expect(
      contents(await owner.session.transcript()).filter(
        (message) => message.content === 'Again?',
      ),
    ).toHaveLength(1)
    await owner.host.close()
    await other.host.close()
  })

  it('ends settled() with InputRejectedError when the owner refuses the offered input', async () => {
    const { a, b } = twoStores()
    const release = gate()
    const owner = await hostOn(
      a,
      harnessWith(mockAdapter([after(release.opened, 'One.')]).adapter),
    )
    const other = await hostOn(b, harnessWith(mockAdapter([]).adapter))

    const turn = owner.session.send('Go.')
    await turn.receipt
    const refused = other.session.send('Now!', {
      inputId: 'in-b',
      busy: 'reject',
    })
    refused.then(
      () => {},
      () => {},
    )
    expect((await refused.receipt).status).toBe('queued')
    await expect(
      other.session.settled({
        inputId: 'in-b',
        signal: AbortSignal.timeout(3_000),
      }),
    ).rejects.toBeInstanceOf(InputRejectedError)

    release.open()
    await turn
    await owner.host.close()
    await other.host.close()
  })

  it('refuses an offer whose id the log has with another payload, on the host that offered it', async () => {
    const { a, b } = twoStores()
    // The owner does not read the lane until the test lets it.
    let isLaneOpen = false
    const slowLane = wrapLogStore(a, {
      offered: (scope) => (isLaneOpen ? a.offered(scope) : Promise.resolve([])),
    })
    const release = gate()
    const ownerModel = mockAdapter([
      after(release.opened, 'One.'),
      () => text('Two.'),
    ])
    const owner = await hostOn(slowLane, harnessWith(ownerModel.adapter))
    const other = await hostOn(b, harnessWith(mockAdapter([]).adapter))

    const turn = owner.session.send('Go.')
    await turn.receipt
    const offered = other.session.send('From B.', { inputId: 'in-x' })
    offered.then(
      () => {},
      () => {},
    )
    expect((await offered.receipt).status).toBe('queued')
    const settled = other.session.settled({
      inputId: 'in-x',
      signal: AbortSignal.timeout(3_000),
    })
    settled.catch(() => {})
    // The owner stores another input with the same id first.
    const stored = owner.session.send('From A.', { inputId: 'in-x' })
    expect((await stored.receipt).status).toBe('queued')
    isLaneOpen = true
    await owner.session.recover()

    await expect(settled).rejects.toMatchObject({
      name: 'InputRejectedError',
      receipt: { reason: 'conflict' },
    })
    await expect(Promise.resolve(offered)).rejects.toBeInstanceOf(
      InputRejectedError,
    )
    expect(await waiting(a)).toEqual([])
    // The input that the log has is not refused: it runs.
    release.open()
    expect((await owner.session.settled({ inputId: 'in-x' })).outcome).toBe(
      'completed',
    )
    expect(ownerModel.calls).toHaveLength(2)
    await owner.host.close()
    await other.host.close()
  })

  it('streams an offered turn under its run id on the host that sent it', async () => {
    const { a, b } = twoStores()
    const release = gate()
    const ownerModel = mockAdapter([
      after(release.opened, 'One.'),
      () => text('Two.'),
    ])
    const owner = await hostOn(a, harnessWith(ownerModel.adapter))
    const other = await hostOn(b, harnessWith(mockAdapter([]).adapter))

    const first = owner.session.send('Go.')
    await first.receipt
    // A `POST run` on the other host: the turn runs on the owner as `run-2`.
    const second = (other.session as unknown as SessionImpl).sendForRun(
      'And then?',
      { runId: 'run-2' },
    )
    expect(await second.receipt).toMatchObject({ status: 'queued' })
    release.open()
    const texts: Array<string> = []
    for await (const event of second.stream()) {
      if (event.type === EventType.TEXT_MESSAGE_CONTENT) texts.push(event.delta)
    }
    expect(texts.join('')).toBe('Two.')
    expect((await second).text).toBe('Two.')
    await owner.host.close()
    await other.host.close()
  })

  it('answers a question that waits on the owner', async () => {
    const { a, b } = twoStores()
    const harness = defineHarness({
      name: NAME,
      adapter: mockAdapter([]).adapter,
      plugins: () => [asking(false)],
    })
    const owner = await hostOn(a, harness)
    const other = await hostOn(b, harness)

    const running = owner.session.command({ name: 'ask' })
    await waitFor(() =>
      expect(questionsOf(owner.session.snapshot())).toHaveLength(1),
    )
    const [question] = questionsOf(owner.session.snapshot())
    const receipt = await other.session.answer({
      questionId: question!.questionId,
      value: 'hunter2',
    })
    expect(receipt.status).toBe('queued')
    expect(await running).toBe('signed in')
    await owner.host.close()
    await other.host.close()
  })

  describe('a secret answer', () => {
    const PASSWORD = 'hunter2-long-password'
    const asksForPassword = definePlugin({
      name: 'test/ask-password',
      setup: () => ({
        commands: {
          ask: defineCommand({
            description: 'Sign in with a password',
            run: async (_input, ctx) => {
              const password = await ctx.step.ask({
                name: 'password',
                message: 'Password?',
                schema: z.string(),
                secret: true,
              })
              return password === PASSWORD ? 'signed in' : 'wrong'
            },
          }),
        },
      }),
    })
    const harness = defineHarness({
      name: NAME,
      adapter: mockAdapter([]).adapter,
      plugins: () => [asksForPassword],
    })

    /** One credential store for both hosts, with the ids that it saved. */
    function sharedCredentials() {
      const store = memoryCredentialStore()
      const saved: Array<string> = []
      const credentials: CredentialStore = {
        ...store,
        set: async (entry) => {
          saved.push(entry.id)
          await store.set(entry)
        },
      }
      return { credentials, saved }
    }

    /**
     * An answer as the owner applies it from the lane: with the `ref` of a
     * secret answer, and the input id of the offer.
     */
    function laneAnswer(
      session: HarnessSession,
      options: {
        questionId: string
        value: unknown
        ref: string
        controlId: string
      },
    ): Promise<Receipt> {
      // `applyAnswer` is internal: the input lane calls it.
      const internal = session as unknown as {
        applyAnswer: (offered: typeof options) => Promise<Receipt>
      }
      return internal.applyAnswer(options)
    }

    /** The owner asks for the password. Resolves with its question id. */
    async function ask(session: HarnessSession, log: LogStore) {
      const running = session.command({ name: 'ask' })
      await waitFor(() =>
        expect(questionsOf(session.snapshot())).toHaveLength(1),
      )
      const [question] = questionsOf(session.snapshot())
      // The other host reads the question from the log.
      await waitFor(async () =>
        expect(JSON.stringify(await log.read({ logId: LOG }))).toContain(
          question!.questionId,
        ),
      )
      return { running, questionId: question!.questionId }
    }

    it('reaches the owner through the credential store, never in clear text', async () => {
      const { a, b } = twoStores()
      const offers: Array<unknown> = []
      const offering = wrapLogStore(b, {
        offer: (input) => {
          offers.push(input)
          return b.offer(input)
        },
      })
      const { credentials, saved } = sharedCredentials()
      const owner = await hostOn(a, harness, { credentials })
      const other = await hostOn(offering, harness, { credentials })
      const events: Array<unknown> = []
      owner.session.onEvent((entry) => events.push(entry))
      other.session.onEvent((entry) => events.push(entry))

      const { running, questionId } = await ask(owner.session, a)
      const receipt = await other.session.answer({
        questionId,
        value: PASSWORD,
      })
      expect(receipt.status).toBe('queued')
      expect(await running).toBe('signed in')

      // The ref of the other host, and the answer that the owner keeps
      // until the command ends, so a run again can read it.
      expect(saved).toHaveLength(2)
      const [ref, kept] = saved
      expect(ref).toMatch(/^harness:answer:/)
      expect(kept).toBe(`harness:answer:${questionId}#kept`)
      // The lane got only the ref, and the owner consumed it.
      expect(JSON.stringify(offers)).toContain(ref)
      expect(JSON.stringify(offers)).not.toContain(PASSWORD)
      expect(await waiting(a)).toEqual([])
      expect(JSON.stringify(await a.read({ logId: LOG }))).not.toContain(
        PASSWORD,
      )
      expect(JSON.stringify(events)).not.toContain(PASSWORD)
      // The owner deleted the entry after it read it, and the kept answer
      // when the command ended.
      expect(await credentials.get({ scope: {}, id: ref! })).toBeNull()
      expect(
        await credentials.get({ scope: { threadId: THREAD }, id: kept! }),
      ).toBeNull()
      expect(await credentials.list({})).toEqual([])

      // The same ref again, as the owner applies it from the lane, is
      // refused: the store no longer has it.
      const replay = await laneAnswer(owner.session, {
        questionId,
        value: '[secret]',
        ref: ref!,
        controlId: 'replay',
      })
      expect(replay).toMatchObject({
        status: 'rejected',
        reason: 'unknown_secret_answer',
      })
      // A ref saved for another user is refused, and stays for that user.
      const theirs = `harness:answer:${questionId}:theirs`
      const scope = { userId: 'someone-else' }
      const credential = {
        type: 'secret_answer' as const,
        value: '"theirs"',
        expiresAt: Date.now() + 60_000,
      }
      await credentials.set({ scope, id: theirs, credential })
      const wrongUser = await laneAnswer(owner.session, {
        questionId,
        value: '[secret]',
        ref: theirs,
        controlId: 'wrong-user',
      })
      expect(wrongUser).toMatchObject({ reason: 'unknown_secret_answer' })
      expect(await credentials.get({ scope, id: theirs })).toEqual(credential)
      // A ref that expired is refused, and deleted.
      const expired = `harness:answer:${questionId}:expired`
      await credentials.set({
        scope: {},
        id: expired,
        credential: { ...credential, expiresAt: Date.now() - 1 },
      })
      const late = await laneAnswer(owner.session, {
        questionId,
        value: '[secret]',
        ref: expired,
        controlId: 'expired',
      })
      expect(late).toMatchObject({ reason: 'unknown_secret_answer' })
      expect(await credentials.get({ scope: {}, id: expired })).toBeNull()
      await owner.host.close()
      await other.host.close()
    })

    it('is refused when the host has no credential store', async () => {
      const { a, b } = twoStores()
      const owner = await hostOn(a, harness)
      const other = await hostOn(b, harness)

      const { running, questionId } = await ask(owner.session, a)
      const receipt = await other.session.answer({
        questionId,
        value: PASSWORD,
      })
      expect(receipt).toMatchObject({
        status: 'rejected',
        reason: 'secret_answer_needs_credentials',
      })
      expect(await waiting(a)).toEqual([])
      expect(questionsOf(owner.session.snapshot())).toHaveLength(1)
      // The owner can still take the answer itself.
      await owner.session.answer({ questionId, value: PASSWORD })
      expect(await running).toBe('signed in')
      expect(JSON.stringify(await a.read({ logId: LOG }))).not.toContain(
        PASSWORD,
      )
      await owner.host.close()
      await other.host.close()
    })

    it('is not in the list of the user credentials while it waits', async () => {
      const store = memoryCredentialStore()
      const scope = { userId: 'u1' }
      await store.set({
        scope,
        id: 'harness:answer:q-1:i-1',
        credential: {
          type: 'secret_answer',
          value: '"secret"',
          expiresAt: Date.now() + 60_000,
        },
      })
      await store.set({
        scope,
        id: 'openai',
        credential: { type: 'api_key', value: 'sk-test-123456' },
      })
      const access = credentialsFor(
        store,
        { ...scope, threadId: THREAD },
        () => {},
      )
      expect(await access.list()).toEqual([{ id: 'openai', type: 'api_key' }])
    })
  })

  it('cancels the turn that runs on the owner', async () => {
    const { a, b } = twoStores()
    const ownerModel = mockAdapter([untilAborted()])
    const owner = await hostOn(a, harnessWith(ownerModel.adapter))
    const other = await hostOn(b, harnessWith(mockAdapter([]).adapter))

    const turn = owner.session.send('Go.')
    const { operationId } = await turn.receipt
    await waitFor(() => expect(ownerModel.calls).toHaveLength(1))
    const receipt = await other.session.cancel({ operationId })
    expect(receipt.status).toBe('queued')

    await expect(Promise.resolve(turn)).rejects.toThrow()
    expect(turn.status()).toBe('cancelled')
    await owner.host.close()
    await other.host.close()
  })

  it('cancels the turn of the owner when the offer comes while the owner appends', async () => {
    const { a, b } = twoStores()
    let other: Awaited<ReturnType<typeof hostOn>> | undefined
    let cancelIn: string | undefined
    // The offer of B lands while the owner's append runs, so the store
    // tells the owner about it during its own write.
    const ownerLog = wrapLogStore(a, {
      append: async (batch) => {
        const operationId = cancelIn
        if (operationId !== undefined && other) {
          cancelIn = undefined
          const receipt = await other.session.cancel({ operationId })
          expect(receipt.status).toBe('queued')
        }
        return a.append(batch)
      },
    })
    const ownerModel = mockAdapter([untilAborted()])
    const owner = await hostOn(ownerLog, harnessWith(ownerModel.adapter))
    const otherHost = await hostOn(b, harnessWith(mockAdapter([]).adapter))
    other = otherHost

    const turn = owner.session.send('Go.')
    const { operationId } = await turn.receipt
    await waitFor(() => expect(ownerModel.calls).toHaveLength(1))
    cancelIn = operationId
    // A write of the owner while its turn runs, with no write after it.
    await owner.session.configure({ settings: { instructions: 'Be brief.' } })
    expect(cancelIn).toBeUndefined()

    await expect(Promise.resolve(turn)).rejects.toThrow()
    expect(turn.status()).toBe('cancelled')
    await owner.host.close()
    await otherHost.host.close()
  })

  it('starts an agent on the owner, and the run of the other host ends with it', async () => {
    const { a, b } = twoStores()
    const ran: Array<string> = []
    const workerOn = (host: string) =>
      defineAgent({
        name: 'worker',
        description: 'Works',
        run: () => {
          ran.push(host)
          return Promise.resolve({ by: host })
        },
      })
    const release = gate()
    const owner = await hostOn(
      a,
      harnessWith(mockAdapter([after(release.opened, 'One.')]).adapter, {
        agents: [workerOn('A')],
      }),
    )
    const other = await hostOn(
      b,
      harnessWith(mockAdapter([]).adapter, { agents: [workerOn('B')] }),
    )

    const turn = owner.session.send('Go.')
    await turn.receipt
    const worker = other.session.agent('worker')
    if (!worker) throw new Error('The harness has no worker agent.')
    expect(await worker.start()).toEqual({ by: 'A' })
    expect(ran).toEqual(['A'])

    release.open()
    await turn
    await owner.host.close()
    await other.host.close()
  })

  it('refuses a revert while the owner runs a turn', async () => {
    const { a, b } = twoStores()
    const release = gate()
    const harness = harnessWith(
      mockAdapter([() => text('One.'), after(release.opened, 'Two.')]).adapter,
    )
    const owner = await hostOn(a, harness)
    await owner.session.send('First.')
    const turn = owner.session.send('Second.')
    await turn.receipt
    const other = await hostOn(b, harness)

    const [first] = await other.session.transcript()
    expect(
      await other.session.revert({ messageId: first?.id ?? '' }),
    ).toMatchObject({
      status: 'rejected',
      reason: 'busy',
    })
    release.open()
    expect((await turn).text).toBe('Two.')
    await owner.host.close()
    await other.host.close()
  })

  it('keeps the offer when the owner fails to store its input, and the next owner runs it', async () => {
    const { a, b } = twoStores()
    const release = gate()
    let failing: string | undefined
    const failingLog = wrapLogStore(a, {
      append: (batch) => {
        const isFailing = batch.records.some(
          (record) =>
            record.type === 'harness.input' && record.inputId === failing,
        )
        return isFailing
          ? Promise.reject(new Error('disk full'))
          : a.append(batch)
      },
    })
    const owner = await hostOn(
      failingLog,
      harnessWith(mockAdapter([after(release.opened, 'One.')]).adapter),
    )
    const otherModel = mockAdapter([() => text('Ran on B.')])
    const other = await hostOn(b, harnessWith(otherModel.adapter))

    const turn = owner.session.send('Go.')
    await turn.receipt
    failing = 'in-b'
    await other.session.send('And then?', { inputId: 'in-b' }).receipt
    // The write fails and stops the session of the owner. The input waits
    // in the lane, and the host that offered it takes the log and runs it.
    await waitFor(() => expect(turn.status()).toBe('failed'))
    expect((await other.session.settled({ inputId: 'in-b' })).outcome).toBe(
      'completed',
    )
    expect(otherModel.calls).toHaveLength(1)
    expect(await waiting(a)).toEqual([])
    release.open()
    await owner.host.close()
    await other.host.close()
  })

  it('does not run an input twice when its record landed and the consume did not', async () => {
    const { a, b } = twoStores()
    // A store that is not atomic, as after a crash between the append and
    // the consume: the first consume is lost.
    let isLost = false
    const losingLog = wrapLogStore(a, {
      append: (batch) => {
        const isFirstConsume = !isLost && (batch.consumes?.length ?? 0) > 0
        if (!isFirstConsume) return a.append(batch)
        isLost = true
        return a.append({ ...batch, consumes: [] })
      },
    })
    const release = gate()
    const ownerModel = mockAdapter([
      after(release.opened, 'One.'),
      () => text('Two.'),
      () => text('Twice.'),
    ])
    const owner = await hostOn(losingLog, harnessWith(ownerModel.adapter))
    const other = await hostOn(b, harnessWith(mockAdapter([]).adapter))

    const turn = owner.session.send('Go.')
    await turn.receipt
    await other.session.send('And then?', { inputId: 'in-b' }).receipt
    release.open()
    expect((await other.session.settled({ inputId: 'in-b' })).outcome).toBe(
      'completed',
    )
    expect(isLost).toBe(true)

    // A drain finds the input in the log: the offer goes, and the input
    // does not run again.
    await owner.session.recover()
    expect(await waiting(a)).toEqual([])
    expect(ownerModel.calls).toHaveLength(2)
    await owner.host.close()
    await other.host.close()
  })

  it('takes the log of an owner that stopped with resumePending: its input runs first, then the offer', async () => {
    const { a, b } = twoStores()
    const ownerModel = mockAdapter([untilAborted()])
    const sweeperModel = mockAdapter([
      () => text('First again.'),
      () => text('Second.'),
    ])
    // The owner never renews its ownership, as after a crash.
    const owner = await hostOn(a, harnessWith(ownerModel.adapter), {
      ownership: CRASHING_OWNERSHIP,
    })
    const turn = owner.session.send('First.')
    turn.then(
      () => {},
      () => {},
    )
    await waitFor(() => expect(ownerModel.calls).toHaveLength(1))
    const sweeper = createHarnessHost({ persistence: { stores: { log: b } } })
    const harness = harnessWith(sweeperModel.adapter)
    const other = await sweeper.open(harness, { threadId: THREAD })
    const receipt = await other.send('Second.', { mode: 'followUp' }).receipt
    expect(receipt.status).toBe('queued')

    await ownershipExpired()
    expect(await sweeper.resumePending({ harnesses: [harness] })).toEqual([
      { threadId: THREAD, harness: NAME },
    ])
    await waitFor(() => expect(sweeperModel.calls).toHaveLength(2))
    // The input of the stopped owner runs first, then the offered one.
    expect(messageTexts(sweeperModel.calls[0])).not.toContain('Second.')
    expect(messageTexts(sweeperModel.calls[1])).toContain('Second.')
    await owner.host.close()
    await sweeper.close()
  })
})

describe('host.submit', () => {
  it('stores the input and runs nothing, and a later resumePending runs it', async () => {
    const log = memoryLogStore()
    const model = mockAdapter([() => text('Done.')])
    const harness = harnessWith(model.adapter)
    const submitter = createHarnessHost({ persistence: { stores: { log } } })

    const receipt = await submitter.submit({
      harness,
      threadId: THREAD,
      input: { op: 'prompt', message: 'Write the report.' },
      inputId: 'in-1',
    })
    expect(receipt).toEqual({ inputId: 'in-1', status: 'queued' })
    expect(await waiting(log)).toEqual(['in-1'])
    expect(model.calls).toHaveLength(0)

    const worker = createHarnessHost({ persistence: { stores: { log } } })
    expect(await worker.resumePending({ harnesses: [harness] })).toEqual([
      { threadId: THREAD, harness: NAME },
    ])
    await waitFor(() => expect(model.calls).toHaveLength(1))
    const session = await worker.open(harness, { threadId: THREAD })
    expect((await session.settled({ inputId: 'in-1' })).outcome).toBe(
      'completed',
    )
    expect(await waiting(log)).toEqual([])
    await submitter.close()
    await worker.close()
  })

  it('refuses another input with an id that an input has', async () => {
    const log = memoryLogStore()
    const harness = harnessWith(mockAdapter([]).adapter)
    const host = createHarnessHost({ persistence: { stores: { log } } })
    const submit = (message: string) =>
      host.submit({
        harness,
        threadId: THREAD,
        input: { op: 'prompt', message },
        inputId: 'in-1',
      })

    expect(await submit('One.')).toEqual({ inputId: 'in-1', status: 'queued' })
    expect(await submit('One.')).toEqual({ inputId: 'in-1', status: 'queued' })
    expect(await submit('Two.')).toEqual({
      inputId: 'in-1',
      status: 'rejected',
      reason: 'conflict',
    })
    await host.close()
  })
})

describe('the input lane while idle', () => {
  it('makes no store calls once both hosts are idle', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })
    const { a, b } = twoStores()
    let isIdle = false
    let idleCalls = 0
    /** `log`, with a count of the calls while the hosts are idle. */
    const counted = (log: LogStore) => {
      const count = () => {
        if (isIdle) idleCalls += 1
      }
      return wrapLogStore(log, {
        read: (query) => (count(), log.read(query)),
        offered: (query) => (count(), log.offered(query)),
        acquire: (claim) => (count(), log.acquire(claim)),
        renew: (claim) => (count(), log.renew(claim)),
        listOrphaned: (query) => (count(), log.listOrphaned(query)),
      })
    }
    const release = gate()
    const ownerModel = mockAdapter([
      after(release.opened, 'One.'),
      () => text('Two.'),
    ])
    const options = { log: { coalesceMs: 0 } }
    const owner = await hostOn(
      counted(a),
      harnessWith(ownerModel.adapter),
      options,
    )
    const other = await hostOn(
      counted(b),
      harnessWith(mockAdapter([]).adapter),
      options,
    )

    const turn = owner.session.send('Go.')
    await turn.receipt
    const receipt = await other.session.send('And then?').receipt
    release.open()
    await other.session.settled({ inputId: receipt.inputId })
    await owner.session.whenIdle()
    await other.session.whenIdle()
    // The writes that end the turn land, and the owner gives the log back.
    for (let round = 0; round < 20; round += 1) {
      await new Promise((resolve) => setImmediate(resolve))
    }

    isIdle = true
    // Longer than the ownership lasts, and than a renewal period.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(idleCalls).toBe(0)
    await owner.host.close()
    await other.host.close()
  })
})

describe('a cancel from any server', () => {
  it('stops the turn of the owner when POST control on another server sends it', async () => {
    const { a, b } = twoStores()
    const ownerModel = mockAdapter([untilAborted()])
    const owner = await hostOn(a, harnessWith(ownerModel.adapter))
    const harness = harnessWith(mockAdapter([]).adapter)
    const other = await hostOn(b, harness)
    const handler = createHarnessHandler({
      host: other.host,
      harness,
      openAccess: true,
    })

    const turn = owner.session.send('Go.')
    const { operationId } = await turn.receipt
    await waitFor(() => expect(ownerModel.calls).toHaveLength(1))
    const response = await handler(
      new Request('http://x/api/harness/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: THREAD,
          input: { op: 'cancel', operationId },
        }),
      }),
    )

    expect(await response.json()).toMatchObject({ status: 'queued' })
    await expect(Promise.resolve(turn)).rejects.toThrow()
    expect(turn.status()).toBe('cancelled')
    await owner.host.close()
    await other.host.close()
  })

  it('does not stop a turn when the client of POST run leaves', async () => {
    const { a } = twoStores()
    const release = gate()
    const harness = harnessWith(
      mockAdapter([after(release.opened, 'Late.')]).adapter,
    )
    const owner = await hostOn(a, harness)
    const handler = createHarnessHandler({
      host: owner.host,
      harness,
      openAccess: true,
    })

    const response = await handler(
      new Request('http://x/api/harness/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: THREAD,
          runId: 'run-1',
          messages: [{ id: 'u1', role: 'user', content: 'Go.' }],
          tools: [],
          context: [],
          state: {},
          forwardedProps: {},
        }),
      }),
    )
    const reader = response.body!.getReader()
    await reader.read()
    // The client leaves while the turn runs.
    await reader.cancel()
    release.open()

    await waitFor(() =>
      expect(owner.session.operation('run-1')?.status()).toBe('completed'),
    )
    expect(contents(await owner.session.transcript()).at(-1)?.content).toBe(
      'Late.',
    )
    await owner.host.close()
  })
})
