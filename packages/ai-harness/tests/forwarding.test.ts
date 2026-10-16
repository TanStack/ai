import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  wakeMessages,
} from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { ChatTurnResult, Operation } from '../src'

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

    const turn = owner.send('Go.')
    await turn.receipt
    const receipt = await other.send('And then?', { mode: 'followUp' }).receipt
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

    const first = owner.send('Go.')
    await first.receipt
    // A `POST run` on the other host: the turn runs on the owner as `run-2`.
    const second = other.send('And then?', { runId: 'run-2' })
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

    const turn = owner.send('Go.')
    await turn.receipt
    const steer = other.send('Faster.', { mode: 'steer' })
    steer.then(
      () => {},
      () => {},
    )
    expect(await steer.receipt).toMatchObject({
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
    const receipt = await first.send('Still there?', { mode: 'followUp' })
      .receipt
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
    const turn = owner.send('Go.')
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

  it('keeps a secret answer from another host out of the inbox and the log', async () => {
    const persistence = sharedStores()
    const login = definePlugin({
      name: 'test/login',
      setup: () => ({
        commands: {
          login: defineCommand({
            description: 'Sign in with a password',
            run: async (_input, ctx) => {
              const password = await ctx.session.ask({
                message: 'Password?',
                schema: z.string(),
                secret: true,
              })
              return password === 'hunter2' ? 'signed in' : 'wrong'
            },
          }),
        },
      }),
    })
    const harness = defineHarness({
      name: NAME,
      adapter: mockAdapter([]).adapter,
      plugins: () => [login],
    })
    const owner = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })
    const other = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })

    const running = owner.command('login')
    await vi.waitFor(() =>
      expect(owner.snapshot().pendingQuestions).toHaveLength(1),
    )
    const [question] = owner.snapshot().pendingQuestions
    const receipt = await other.answer({
      questionId: question!.questionId,
      value: 'hunter2',
    })
    expect(receipt.status).toBe('queued')
    expect(await running).toBe('signed in')
    // The owner deletes the entry after it applies the answer.
    await vi.waitFor(async () =>
      expect(
        await persistence.stores.inbox!.get({
          threadId: THREAD,
          inputId: receipt.inputId,
        }),
      ).toBeNull(),
    )
    const log = await persistence.stores.log.read(THREAD)
    expect(JSON.stringify(log)).not.toContain('hunter2')
  })

  it('runs a forwarded command once when the owner applies it again', async () => {
    const persistence = sharedStores()
    const release = gate()
    const { adapter } = mockAdapter([after(release.opened, 'One.')])
    let runs = 0
    const counter = definePlugin({
      name: 'test/counter',
      setup: () => ({
        commands: {
          count: defineCommand({
            description: 'Count the runs',
            run: () => (runs += 1),
          }),
        },
      }),
    })
    const harness = defineHarness({
      name: NAME,
      adapter,
      plugins: () => [counter],
    })
    // The owner's first `markApplied` fails, so the next read applies the
    // entry again.
    const inbox = persistence.stores.inbox!
    let failed = false
    const owner = await createHarnessHost({
      persistence: {
        stores: {
          ...persistence.stores,
          inbox: Object.assign(Object.create(inbox), {
            markApplied: (entry: Parameters<typeof inbox.markApplied>[0]) => {
              if (failed) return inbox.markApplied(entry)
              failed = true
              return Promise.reject(new Error('store down'))
            },
          }),
        },
      },
    }).open(harness, { threadId: THREAD })
    const other = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })

    const turn = owner.send('Go.')
    await turn.receipt
    await other.command('count')
    await vi.waitFor(
      async () => expect(await inbox.listPending(THREAD)).toEqual([]),
      { timeout: 4_000 },
    )
    expect(runs).toBe(1)
    release.open()
    await turn
  })

  it('keeps the wake mark of a forwarded follow-up', async () => {
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

    const turn = owner.send('Go.')
    await turn.receipt
    // A background job ended on the other host and wakes the session.
    const wake = other as unknown as {
      startTurn: (
        input: { op: 'followUp'; message: string },
        options: { wake: boolean },
      ) => { receipt: Promise<{ status: string }> }
    }
    const woken = wake.startTurn(
      { op: 'followUp', message: 'Job done.' },
      { wake: true },
    )
    expect((await woken.receipt).status).toBe('queued')
    release.open()
    await vi.waitFor(() => expect(calls).toHaveLength(2), { timeout: 3_000 })
    expect(wakeMessages(calls[1]!.messages)).toEqual(['Job done.'])
  })

  it('keeps a bounded number of forwarded ids', async () => {
    const persistence = sharedStores()
    await persistence.stores.workClaims.claim({
      threadId: THREAD,
      harness: NAME,
      ownerId: 'busy-host',
      until: Date.now() + 60_000,
    })
    const other = await createHarnessHost({ persistence }).open(
      harnessOf(mockAdapter([]).adapter),
      { threadId: THREAD },
    )
    let last = ''
    let operation: Operation<ChatTurnResult> | undefined
    for (let index = 0; index < 510; index++) {
      operation = other.send(`Message ${index}.`, { mode: 'followUp' })
      last = (await operation.receipt).inputId
    }
    const { forwarded } = other as unknown as { forwarded: Set<string> }
    expect(forwarded.size).toBe(500)
    expect(forwarded.has(last)).toBe(true)
    // The owner runs the input. The follower here ends with the session.
    await other.close()
    await expect(operation).rejects.toThrow('Session closed.')
  })

  it('refuses a revert on a host that does not own the thread, and the owner turn goes on', async () => {
    const persistence = sharedStores()
    const release = gate()
    const { adapter } = mockAdapter([
      () => text('One.'),
      after(release.opened, 'Two.'),
    ])
    const harness = harnessOf(adapter)
    const owner = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })
    await owner.send('First.')
    const turn = owner.send('Second.')
    await turn.receipt
    // Another instance opens the thread while the owner runs the turn.
    const other = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })
    const [first] = await other.transcript()
    expect(await other.revert(first?.id ?? '')).toMatchObject({
      status: 'rejected',
      reason: 'busy',
    })
    expect(await other.unrevert()).toMatchObject({
      status: 'rejected',
      reason: 'busy',
    })
    release.open()
    expect((await turn).text).toBe('Two.')
  })

  it('runs a forwarded POST run on the host that took it, under its run id, after the owner stopped', async () => {
    const persistence = sharedStores()
    const { adapter, calls } = mockAdapter([() => text('Picked up.')])
    // A host that stopped holds a claim that is about to expire.
    await persistence.stores.workClaims.claim({
      threadId: THREAD,
      harness: NAME,
      ownerId: 'stopped-host',
      until: Date.now() + 50,
    })
    const host = await createHarnessHost({ persistence }).open(
      harnessOf(adapter),
      { threadId: THREAD },
    )
    const turn = host.send('Still there?', { runId: 'run-9' })
    expect((await turn.receipt).status).toBe('queued')
    // The claim expires. This host reads the inbox and runs the input.
    await vi.waitFor(() => expect(calls).toHaveLength(1), { timeout: 3_000 })
    expect(turn.id).toBe('run-9')
    expect((await turn).text).toBe('Picked up.')
  })

  it('keeps an inbox entry pending when the owner fails to store the input', async () => {
    const persistence = sharedStores()
    const release = gate()
    const { adapter } = mockAdapter([after(release.opened, 'One.')])
    const harness = harnessOf(adapter)
    const log = persistence.stores.log
    let failing: string | undefined
    const owner = await createHarnessHost({
      persistence: {
        stores: {
          ...persistence.stores,
          log: Object.assign(Object.create(log), {
            append: (batch: Parameters<typeof log.append>[0]) =>
              batch.records.some(
                (record) =>
                  record.type === 'harness.input' && record.inputId === failing,
              )
                ? Promise.reject(new Error('disk full'))
                : log.append(batch),
          }),
        },
      },
    }).open(harness, { threadId: THREAD })
    const other = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })

    const turn = owner.send('Go.')
    await turn.receipt
    const receipt = await other.send('And then?').receipt
    expect(receipt.status).toBe('queued')
    failing = receipt.inputId
    // The owner reads the inbox within a second, and the write fails.
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    // The input waits for the next host.
    expect(
      (await persistence.stores.inbox!.listPending(THREAD)).map(
        (entry) => entry.inputId,
      ),
    ).toEqual([receipt.inputId])
    release.open()
    await Promise.resolve(turn).catch(() => {})
  })

  it('recovers the input of the stopped owner when a host takes the thread from the inbox', async () => {
    const persistence = sharedStores()
    const { adapter, calls } = mockAdapter([
      () => text('One.'),
      () => text('Two.'),
    ])
    const harness = harnessOf(adapter)
    // The owner stores its input, then stops before it writes its run lease.
    const runs = persistence.stores.runs
    const owner = await createHarnessHost({
      lease: { ttlMs: 200, renewMs: 50 },
      persistence: {
        stores: {
          ...persistence.stores,
          runs: Object.assign(Object.create(runs), {
            createOrResume: () => new Promise(() => {}),
          }),
        },
      },
    }).open(harness, { threadId: THREAD })
    await owner.send('First.').receipt
    const other = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })
    const receipt = await other.send('Second.', { mode: 'followUp' }).receipt
    expect(receipt.status).toBe('queued')

    // The owner stops renewing its claim, as after a crash.
    ;(owner as unknown as { stopClaimTimer: () => void }).stopClaimTimer()
    await vi.waitFor(() => expect(calls).toHaveLength(2), { timeout: 4_000 })
    // The owner's input runs first, then the forwarded one.
    expect(messageTexts(calls[1])).toContain('Second.')
  })

  it('runs a forwarded resume as its run id, and its receipt names that run', async () => {
    const persistence = sharedStores()
    const openScreen = toolDefinition({
      name: 'openScreen',
      description: 'Open a screen. Runs on the client.',
      inputSchema: z.object({ route: z.string() }),
      outputSchema: z.object({ opened: z.boolean() }),
    })
    const { adapter, calls } = mockAdapter([
      () => toolCall('openScreen', { route: '/settings' }),
      () => text('Opened it.'),
    ])
    const harness = defineHarness({ name: NAME, adapter, tools: [openScreen] })
    const owner = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })
    const turn = await owner.send('Open settings.')
    const interruptId = turn.interrupts?.[0]?.id
    if (!interruptId) throw new Error('The turn did not stop for the tool.')
    // The owner stops, and another host holds the thread when the resume
    // comes (a turn that still ends, for example), then stops too.
    await owner.close()
    await persistence.stores.workClaims.claim({
      threadId: THREAD,
      harness: NAME,
      ownerId: 'busy-host',
      until: Date.now() + 100,
    })
    const other = await createHarnessHost({ persistence }).open(harness, {
      threadId: THREAD,
    })
    // A `POST run` with a resume: the run id is the input id too.
    const receipt = await other.resolve(
      [{ interruptId, status: 'resolved', payload: { opened: true } }],
      { inputId: 'run-r', runId: 'run-r' },
    )
    expect(receipt).toMatchObject({ status: 'queued', operationId: 'run-r' })
    await vi.waitFor(() => expect(calls).toHaveLength(2), { timeout: 3_000 })
    expect((await other.settled('run-r')).outcome).toBe('completed')
  })
})
