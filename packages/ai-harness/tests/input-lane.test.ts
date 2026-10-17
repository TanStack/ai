import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent } from '@tanstack/ai'
import { memoryLogBackend, memoryLogStore } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  logIdOf,
} from '../src'
import {
  CRASHING_OWNERSHIP,
  after,
  gate,
  messageTexts,
  mockAdapter,
  ownershipExpired,
  text,
  untilAborted,
  wrapLogStore,
} from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { AnyAgent, AnyHarness, HarnessHostOptions } from '../src'

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
            const password = await ctx.session.ask({
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
    expect((await other.session.settled(receipt.inputId)).outcome).toBe(
      'completed',
    )
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
    expect((await other.session.settled('in-b')).outcome).toBe('completed')
    expect(ownerModel.calls).toHaveLength(2)
    expect(
      contents(await owner.session.transcript()).filter(
        (message) => message.content === 'Again?',
      ),
    ).toHaveLength(1)
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
    const second = other.session.send('And then?', { runId: 'run-2' })
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
    await vi.waitFor(() =>
      expect(owner.session.snapshot().pendingQuestions).toHaveLength(1),
    )
    const [question] = owner.session.snapshot().pendingQuestions
    const receipt = await other.session.answer({
      questionId: question!.questionId,
      value: 'hunter2',
    })
    expect(receipt.status).toBe('queued')
    expect(await running).toBe('signed in')
    await owner.host.close()
    await other.host.close()
  })

  it('keeps a secret answer out of the log, and out of the lane once applied', async () => {
    const { a, b } = twoStores()
    const harness = defineHarness({
      name: NAME,
      adapter: mockAdapter([]).adapter,
      plugins: () => [asking(true)],
    })
    const owner = await hostOn(a, harness)
    const other = await hostOn(b, harness)

    const running = owner.session.command({ name: 'ask' })
    await vi.waitFor(() =>
      expect(owner.session.snapshot().pendingQuestions).toHaveLength(1),
    )
    const [question] = owner.session.snapshot().pendingQuestions
    await other.session.answer({
      questionId: question!.questionId,
      value: 'hunter2',
    })
    expect(await running).toBe('signed in')
    expect(await waiting(a)).toEqual([])
    const log = await a.read({ logId: LOG })
    expect(JSON.stringify(log)).not.toContain('hunter2')
    await owner.host.close()
    await other.host.close()
  })

  it('cancels the turn that runs on the owner', async () => {
    const { a, b } = twoStores()
    const ownerModel = mockAdapter([untilAborted()])
    const owner = await hostOn(a, harnessWith(ownerModel.adapter))
    const other = await hostOn(b, harnessWith(mockAdapter([]).adapter))

    const turn = owner.session.send('Go.')
    const { operationId } = await turn.receipt
    await vi.waitFor(() => expect(ownerModel.calls).toHaveLength(1))
    const receipt = await other.session.cancel({ operationId })
    expect(receipt.status).toBe('queued')

    await expect(Promise.resolve(turn)).rejects.toThrow()
    expect(turn.status()).toBe('cancelled')
    await owner.host.close()
    await other.host.close()
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
    expect(await other.session.revert(first?.id ?? '')).toMatchObject({
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
    await vi.waitFor(() => expect(turn.status()).toBe('failed'))
    expect((await other.session.settled('in-b')).outcome).toBe('completed')
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
    expect((await other.session.settled('in-b')).outcome).toBe('completed')
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
    await vi.waitFor(() => expect(ownerModel.calls).toHaveLength(1))
    const sweeper = createHarnessHost({ persistence: { stores: { log: b } } })
    const harness = harnessWith(sweeperModel.adapter)
    const other = await sweeper.open(harness, { threadId: THREAD })
    const receipt = await other.send('Second.', { mode: 'followUp' }).receipt
    expect(receipt.status).toBe('queued')

    await ownershipExpired()
    expect(await sweeper.resumePending({ harnesses: [harness] })).toEqual([
      { threadId: THREAD, harness: NAME },
    ])
    await vi.waitFor(() => expect(sweeperModel.calls).toHaveLength(2))
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
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))
    const session = await worker.open(harness, { threadId: THREAD })
    expect((await session.settled('in-1')).outcome).toBe('completed')
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
    await other.session.settled(receipt.inputId)
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
