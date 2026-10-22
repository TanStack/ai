import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { defineByokProvider, keyedAdapter } from '@tanstack/ai/byok'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
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
  after,
  gate,
  mockAdapter,
  questionsOf,
  text,
  toolCall,
} from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type {
  AccessPolicy,
  Authorize,
  HarnessHost,
  HarnessRunContext,
  HostEvent,
} from '../src'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

afterEach(() => {
  vi.unstubAllEnvs()
})

interface User {
  id: string
  tenantId: string
  role: 'user' | 'admin'
}

const olga: User = { id: 'olga', tenantId: 'acme', role: 'user' }
const bea: User = { id: 'bea', tenantId: 'acme', role: 'user' }
const vic: User = { id: 'vic', tenantId: 'acme', role: 'user' }
const cid: User = { id: 'cid', tenantId: 'acme', role: 'user' }
const gus: User = { id: 'gus', tenantId: 'globex', role: 'user' }

const THREAD = 't1'

/** A host with access, and a harness whose turns are `replies`. */
function accessHost({
  replies = () => text('ok'),
  rules = membersOnly(),
  allowServerEnvKeys,
  adapter,
}: {
  replies?: Array<Reply> | Reply
  rules?: AccessPolicy<User>
  allowServerEnvKeys?: boolean
  adapter?: AnyTextAdapter | ReturnType<typeof acmeAdapter>['adapter']
} = {}) {
  const persistence = memoryPersistence()
  const { sessions } = persistence.stores
  const host = createHarnessHost({
    persistence,
    access: {
      getUser: (): User | null => null,
      rules,
      ...(allowServerEnvKeys !== undefined ? { allowServerEnvKeys } : {}),
    },
  })
  const harness = defineHarness({
    name: 'test/access',
    adapter: adapter ?? mockAdapter(replies).adapter,
  })
  const open = (user: User, threadId = THREAD) =>
    host.open(harness, { threadId, user })
  return { host, harness, sessions, open, log: persistence.stores.log }
}

/** A tool that keeps the user of each run that calls it. */
function whoami() {
  const seen: Array<string | undefined> = []
  const tool = toolDefinition({
    name: 'whoami',
    description: 'Who runs this?',
    inputSchema: z.object({}),
  })
  const plugin = definePlugin({
    name: 'test/whoami',
    setup: () => ({
      tools: [
        tool.server<HarnessRunContext>((_input, { context }) => {
          seen.push(context.run.user?.id)
          return Promise.resolve({})
        }),
      ],
    }),
  })
  return { plugin, seen }
}

const acme = defineByokProvider({
  id: 'acme',
  label: 'Acme',
  env: 'ACME_TEST_KEY',
})

/** A keyed adapter for `acme`. It keeps each key it got. */
function acmeAdapter() {
  const keys: Array<string> = []
  const adapter = keyedAdapter(acme, (key) => {
    keys.push(key)
    return mockAdapter(() => text('keyed answer')).adapter
  })
  return { adapter, keys }
}

/** Read `host.events()` into a list until `stop` runs. */
function readEvents(host: Pick<HarnessHost<User>, 'events'>) {
  const events: Array<HostEvent> = []
  const reader = new AbortController()
  const reading = (async () => {
    for await (const event of host.events({ signal: reader.signal })) {
      events.push(event)
    }
  })()
  const stop = async () => {
    reader.abort()
    await reading
  }
  return { events, stop }
}

describe('host access with membersOnly()', () => {
  it('lets a member that the owner shared with send, and refuses a stranger', async () => {
    const { host, harness, open } = accessHost({
      replies: [() => text('one'), () => text('two')],
    })
    const owner = await open(olga)
    await owner.send('Hi.')
    await host.sessions.share({
      threadId: THREAD,
      userId: 'bea',
      role: 'member',
      user: olga,
    })

    const member = await open(bea)

    expect(await member.send('Me too.')).toEqual({ text: 'two', media: [] })
    await expect(open(cid)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(
      host.sessions.get({ threadId: THREAD, user: cid }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    const listed = async (user: User) =>
      (await host.sessions.list({ user })).entries.map(
        (entry) => entry.threadId,
      )
    expect(await listed(bea)).toEqual([THREAD])
    expect(await listed(cid)).toEqual([])
    expect(host.isOpen(harness, { threadId: THREAD, user: bea })).toBe(true)
    await host.close()
  })

  it('opens a thread id of another tenant as a new session of the own tenant', async () => {
    const { host, open } = accessHost()
    const owner = await open(olga)
    await owner.send('The plan of acme.')

    const other = await open(gus)

    expect(await other.transcript()).toEqual([])
    expect(
      await host.sessions.get({ threadId: THREAD, user: gus }),
    ).toMatchObject({
      tenantId: 'globex',
      members: [{ userId: 'gus', role: 'owner' }],
    })
    expect(
      await host.sessions.get({ threadId: THREAD, user: olga }),
    ).toMatchObject({
      tenantId: 'acme',
      members: [{ userId: 'olga', role: 'owner' }],
    })
    await host.close()
  })

  it('lets a viewer read but not send, and a member send but not configure', async () => {
    const { host, open } = accessHost()
    await open(olga)
    for (const [userId, role] of [
      ['bea', 'member'],
      ['vic', 'viewer'],
    ] as const) {
      await host.sessions.share({
        threadId: THREAD,
        userId,
        role,
        user: olga,
      })
    }
    const viewer = await open(vic)
    const member = await open(bea)

    expect(await viewer.transcript()).toEqual([])
    await expect(viewer.send('Hi.')).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(
      member.updateThreadSettings({ settings: { instructions: 'Be short.' } }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    expect(member.threadSettings()).toEqual({})
    await host.close()
  })

  it('lets a member cancel only a run that the member started', async () => {
    const release = gate()
    const { host, open } = accessHost({
      replies: [after(release.opened, 'owner done'), () => text('never')],
    })
    const owner = await open(olga)
    await host.sessions.share({
      threadId: THREAD,
      userId: 'bea',
      role: 'member',
      user: olga,
    })
    const member = await open(bea)
    const ownerTurn = owner.send('A long task.')
    await ownerTurn.receipt
    const memberTurn = member.send('After that.')
    expect((await memberTurn.receipt).status).toBe('queued')

    await expect(
      member.cancel({ operationId: ownerTurn.id }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    expect((await member.cancel({ operationId: memberTurn.id })).status).toBe(
      'accepted',
    )

    await expect(memberTurn).rejects.toThrow('Cancelled before it started.')
    release.open()
    expect(await ownerTurn).toEqual({ text: 'owner done', media: [] })
    await host.close()
  })

  it('removes a member with unshare: their queued turn stops, and their handle refuses every call', async () => {
    const release = gate()
    const { host, open } = accessHost({
      replies: [after(release.opened, 'owner done'), () => text('never')],
    })
    const owner = await open(olga)
    await host.sessions.share({
      threadId: THREAD,
      userId: 'bea',
      role: 'member',
      user: olga,
    })
    const member = await open(bea)
    const ownerTurn = owner.send('A long task.')
    await ownerTurn.receipt
    const memberTurn = member.send('After that.')
    expect((await memberTurn.receipt).status).toBe('queued')

    const changed = await host.sessions.unshare({
      threadId: THREAD,
      userId: 'bea',
      user: olga,
    })

    expect(changed?.members).toEqual([{ userId: 'olga', role: 'owner' }])
    await expect(memberTurn).rejects.toThrow('Cancelled before it started.')
    expect(() => member.send('Again.')).toThrow(AccessDeniedError)
    expect(() => member.snapshot()).toThrow(AccessDeniedError)
    await expect(open(bea)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(
      host.sessions.unshare({
        threadId: THREAD,
        userId: 'olga',
        user: olga,
      }),
    ).rejects.toThrow('the owner cannot be removed')
    release.open()
    expect(await ownerTurn).toEqual({ text: 'owner done', media: [] })
    await host.close()
  })

  it("forks for the forker alone by default, and with the source's members for 'all'", async () => {
    const { host, harness, open } = accessHost({
      replies: () => text('answer'),
    })
    const owner = await open(olga)
    await owner.send('Hi.')
    for (const [userId, role] of [
      ['bea', 'member'],
      ['vic', 'viewer'],
    ] as const) {
      await host.sessions.share({
        threadId: THREAD,
        userId,
        role,
        user: olga,
      })
    }
    const last = (await owner.transcript()).at(-1)?.id ?? ''
    const fork = (members?: 'self' | 'all') =>
      host.sessions.fork({
        harness,
        threadId: THREAD,
        at: { through: last },
        ...(members ? { members } : {}),
        user: bea,
      })

    expect(await fork()).toMatchObject({
      members: [{ userId: 'bea', role: 'owner' }],
    })
    expect(await fork('all')).toMatchObject({
      members: [
        { userId: 'bea', role: 'owner' },
        { userId: 'olga', role: 'member' },
        { userId: 'vic', role: 'viewer' },
      ],
    })
    await host.close()
  })

  it("forks with the source's members by default under membersOnly({ fork: { members: 'all' } })", async () => {
    const { host, harness, open } = accessHost({
      rules: membersOnly({ fork: { members: 'all' } }),
    })
    const owner = await open(olga)
    await owner.send('Hi.')
    await host.sessions.share({
      threadId: THREAD,
      userId: 'bea',
      role: 'member',
      user: olga,
    })
    const last = (await owner.transcript()).at(-1)?.id ?? ''

    const entry = await host.sessions.fork({
      harness,
      threadId: THREAD,
      at: { through: last },
      user: olga,
    })

    expect(entry).toMatchObject({
      members: [
        { userId: 'olga', role: 'owner' },
        { userId: 'bea', role: 'member' },
      ],
    })
    await host.close()
  })

  it('does not give an entry with no owner to the next opener', async () => {
    const { host, sessions, open } = accessHost()
    await sessions.upsert({
      tenantId: 'acme',
      threadId: 'orphan',
      members: [],
      createdAt: 1,
      updatedAt: 1,
    })

    await expect(open(olga, 'orphan')).rejects.toBeInstanceOf(AccessDeniedError)
    expect(
      await sessions.get({
        tenantId: 'acme',
        threadId: 'orphan',
      }),
    ).toEqual({
      tenantId: 'acme',
      threadId: 'orphan',
      members: [],
      createdAt: 1,
      updatedAt: 1,
    })
    await host.close()
  })

  it('checks a child thread through its root thread', async () => {
    const { host, sessions, open } = accessHost()
    await open(olga)
    await host.sessions.share({
      threadId: THREAD,
      userId: 'bea',
      role: 'viewer',
      user: olga,
    })
    const child = {
      tenantId: 'acme',
      threadId: 'subagent:run-1',
      parentThreadId: THREAD,
      members: [],
      createdAt: 1,
      updatedAt: 1,
    }
    await sessions.upsert(child)

    expect(
      (await host.sessions.list({ parentThreadId: THREAD, user: bea })).entries,
    ).toEqual([child])
    expect(
      await host.sessions.get({ threadId: child.threadId, user: bea }),
    ).toEqual(child)
    await expect(
      host.sessions.list({ parentThreadId: THREAD, user: cid }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    await host.close()
  })

  it('refuses a stranger who opens a child thread, without naming its parent', async () => {
    const { host, sessions, open } = accessHost()
    await open(olga)
    await sessions.upsert({
      tenantId: 'acme',
      threadId: 'subagent:run-1',
      parentThreadId: THREAD,
      members: [],
      createdAt: 1,
      updatedAt: 1,
    })
    await sessions.upsert({
      tenantId: 'acme',
      threadId: 'subagent:lost',
      parentThreadId: 'gone',
      members: [],
      createdAt: 1,
      updatedAt: 1,
    })

    const refusal = await open(cid, 'subagent:run-1').catch((e: unknown) => e)
    expect(refusal).toBeInstanceOf(AccessDeniedError)
    expect(String(refusal)).not.toContain(THREAD)
    const lost = await open(cid, 'subagent:lost').catch((e: unknown) => e)
    expect(lost).toBeInstanceOf(AccessDeniedError)
    expect(String(lost)).not.toContain('gone')
    // The owner of the root learns why the open refuses it.
    await expect(open(olga, 'subagent:run-1')).rejects.toThrow(
      'is a child thread of',
    )
    await host.close()
  })
})

describe('host access with your own access tables', () => {
  /** An authorize that allows the users in `allowed`, for every action. */
  function tableAccess(...users: Array<string>) {
    const allowed = new Set(users)
    const authorize: Authorize<User> = ({ user }) => allowed.has(user.id)
    return { allowed, authorize }
  }

  it('closes the handles of a revoked user and tells host.events() readers', async () => {
    const table = tableAccess('olga', 'bea')
    const { host, open } = accessHost({
      rules: { isAllowed: table.authorize },
    })
    await open(olga)
    const member = await open(bea)
    const reader = readEvents(host)

    table.allowed.delete('bea')
    host.revoke({ threadId: THREAD, user: bea })

    expect(() => member.snapshot()).toThrow(AccessDeniedError)
    expect(() => member.logState()).toThrow(AccessDeniedError)
    await waitFor(() =>
      expect(reader.events.filter((event) => event.type === 'revoked')).toEqual(
        [
          {
            type: 'revoked',
            tenantId: 'acme',
            threadId: THREAD,
            userId: 'bea',
            at: expect.any(Number),
          },
        ],
      ),
    )
    // The app gives the access back: a new open works.
    table.allowed.add('bea')
    expect((await open(bea)).snapshot().threadId).toBe(THREAD)
    await reader.stop()
    await host.close()
  })

  it('refuses share without access.rules.members', async () => {
    const { host, open } = accessHost({
      rules: { isAllowed: tableAccess('olga').authorize },
    })
    await open(olga)

    await expect(
      host.sessions.share({
        threadId: THREAD,
        userId: 'bea',
        role: 'member',
        user: olga,
      }),
    ).rejects.toThrow(
      'host.sessions.share needs access.rules.members (membersOnly() has it). With your own access tables, change them and call host.revoke.',
    )
    await host.close()
  })
})

/** Each user may do all, but answer or cancel only for a run or a schedule of their own. */
const ownRunsOnly: Authorize<User> = ({ user, action, run }) =>
  (action !== 'cancel' && action !== 'answer') ||
  run === undefined ||
  run.userId === user.id

/** Does the log of `THREAD` in tenant `acme` have a record of `type`? */
async function hasRecord(
  log: LogStore,
  type: string,
  match: (record: Record<string, unknown>) => boolean = () => true,
) {
  const entries = await log.read({
    logId: logIdOf({ tenantId: 'acme', logId: THREAD }),
  })
  return entries.some(({ record }) => record.type === type && match(record))
}

/** The input ids that wait in the lane of `THREAD` in tenant `acme`. */
const waitingIn = async (log: LogStore) =>
  (
    await log.listOfferedInputs({
      logId: logIdOf({ tenantId: 'acme', logId: THREAD }),
    })
  ).map((offer) => offer.inputId)

/** A command that asks a question, and returns the answer. */
const asking = definePlugin({
  name: 'test/ask',
  setup: () => ({
    commands: {
      ask: defineCommand({
        description: 'Ask a question',
        run: (_input, ctx) =>
          ctx.step.ask({ name: 'name', message: 'Name?', schema: z.string() }),
      }),
    },
  }),
})

/** Two hosts with access on one database, and a harness with `asking`. */
function twoAccessHosts(replies: Array<Reply>) {
  const persistence = memoryPersistence()
  const access = {
    getUser: (): User | null => null,
    rules: { isAllowed: ownRunsOnly },
  }
  const owner = createHarnessHost({ persistence, access })
  const submitter = createHarnessHost({ persistence, access })
  const harness = defineHarness({
    name: 'test/access',
    adapter: mockAdapter(replies).adapter,
    plugins: () => [asking],
  })
  return { owner, submitter, harness, log: persistence.stores.log }
}

describe('access to the inputs of the input lane', () => {
  it('checks a cancel from host.submit against the run it targets', async () => {
    const release = gate()
    const { owner, submitter, harness, log } = twoAccessHosts([
      after(release.opened, 'bea done'),
    ])
    const member = await owner.open(harness, {
      threadId: THREAD,
      user: bea,
    })
    const turn = member.send('A long task.')
    // The run starts: the log has it.
    await waitFor(async () =>
      expect(await hasRecord(log, 'harness.input.applied')).toBe(true),
    )
    const submit = (user: User, operationId: string) =>
      submitter.submit({
        harness,
        threadId: THREAD,
        user,
        input: { op: 'cancel', operationId },
      })

    await expect(submit(olga, turn.id)).rejects.toBeInstanceOf(
      AccessDeniedError,
    )
    expect(await waitingIn(log)).toEqual([])
    expect(await submit(olga, 'no-such-run')).toMatchObject({
      status: 'rejected',
      reason: 'unknown_run',
    })
    expect(await waitingIn(log)).toEqual([])
    expect(turn.status()).not.toBe('cancelled')

    release.open()
    expect(await turn).toEqual({ text: 'bea done', media: [] })
    await owner.close()
    await submitter.close()
  })

  it('checks an answer from host.submit against the run that asked', async () => {
    const { owner, submitter, harness } = twoAccessHosts([])
    const member = await owner.open(harness, {
      threadId: THREAD,
      user: bea,
    })
    const running = member.runCommand({ name: 'ask' })
    await waitFor(() => expect(questionsOf(member.snapshot())).toHaveLength(1))
    const [question] = questionsOf(member.snapshot())
    const answer = (user: User, value: string) =>
      submitter.submit({
        harness,
        threadId: THREAD,
        user,
        input: { op: 'answer', questionId: question!.questionId, value },
      })

    await expect(answer(olga, 'olga')).rejects.toBeInstanceOf(AccessDeniedError)
    expect((await answer(bea, 'bea')).status).toBe('queued')
    expect(await running).toBe('bea')
    await owner.close()
    await submitter.close()
  })

  it('checks a scheduled cancel against the run it targets', async () => {
    const release = gate()
    const { host, open, log } = accessHost({
      rules: { isAllowed: ownRunsOnly },
      replies: [after(release.opened, 'bea done')],
    })
    const member = await open(bea)
    const other = await open(olga)
    const turn = member.send('A long task.')
    // The run starts: the log has it.
    await waitFor(async () =>
      expect(await hasRecord(log, 'harness.input.applied')).toBe(true),
    )
    const schedule = (operationId: string) =>
      other.schedule({
        at: Date.now(),
        input: { op: 'cancel', operationId },
      })

    await expect(schedule(turn.id)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(schedule('no-such-run')).rejects.toThrow(
      'The session rejected the input: unknown_run.',
    )
    expect(await hasRecord(log, 'harness.schedule')).toBe(false)
    expect(turn.status()).not.toBe('cancelled')

    release.open()
    expect(await turn).toEqual({ text: 'bea done', media: [] })
    await host.close()
  })

  it('lets a user cancel only a schedule that the user made', async () => {
    const { host, open, log } = accessHost({
      rules: { isAllowed: ownRunsOnly },
    })
    const member = await open(bea)
    const other = await open(olga)
    const { scheduleId } = await member.schedule({
      at: Date.now() + 60 * 60 * 1000,
      input: { op: 'prompt', message: 'Later.' },
    })
    const isDone = () =>
      hasRecord(
        log,
        'harness.schedule.done',
        (record) => record.scheduleId === scheduleId,
      )

    await expect(other.cancelSchedule({ scheduleId })).rejects.toBeInstanceOf(
      AccessDeniedError,
    )
    expect(await isDone()).toBe(false)
    await member.cancelSchedule({ scheduleId })
    expect(await isDone()).toBe(true)
    await host.close()
  })
})

describe('a resolve of the waits of background agent runs', () => {
  /** Two hosts on one database. `cleaner` waits for an approval. */
  function cleaningHosts() {
    const persistence = memoryPersistence()
    const access = {
      getUser: (): User | null => null,
      rules: { isAllowed: ownRunsOnly },
    }
    const owner = createHarnessHost({ persistence, access })
    const submitter = createHarnessHost({ persistence, access })
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(() => Promise.resolve({ removed: true }))
    const model = mockAdapter([
      () => toolCall('remove', { path: 'a.log' }, 'call-a'),
      () => toolCall('remove', { path: 'b.log' }, 'call-b'),
      () => text('Done.'),
      () => text('Done.'),
    ])
    const cleaner = defineAgent({
      name: 'cleaner',
      description: 'Cleans up',
      run: (ctx) => ctx.chat({ adapter: model.adapter, tools: [remove] }),
    })
    const harness = defineHarness({
      name: 'test/access',
      adapter: mockAdapter([]).adapter,
      agents: [cleaner],
    })
    return { owner, submitter, harness }
  }

  /** bea and olga each start a run that waits for an approval. */
  async function twoWaitingRuns() {
    const hosts = cleaningHosts()
    const open = (user: User) =>
      hosts.owner.open(hosts.harness, { threadId: THREAD, user })
    const mine = await open(bea)
    const theirs = await open(olga)
    const runs = [mine.agents.cleaner.start(), theirs.agents.cleaner.start()]
    for (const run of runs)
      run.then(
        () => {},
        () => {},
      )
    const waitOf = (runId: string) =>
      waitFor(() => {
        const wait = mine
          .snapshot()
          .pendingWaits.find((open) => open.runId === runId)
        expect(wait).toBeDefined()
        return wait!
      })
    const beaWait = await waitOf(runs[0]!.id)
    const olgaWait = await waitOf(runs[1]!.id)
    return { ...hosts, mine, beaWait, olgaWait }
  }

  it('refuses a batch with the wait of a run of another user', async () => {
    const { owner, submitter, mine, beaWait, olgaWait } = await twoWaitingRuns()
    const answer = (waitId: string) =>
      ({ interruptId: waitId, status: 'resolved', payload: true }) as const

    expect(
      await mine.resolve({
        resume: [answer(beaWait.waitId), answer(olgaWait.waitId)],
      }),
    ).toMatchObject({ status: 'rejected', reason: 'mixed_runs' })
    expect(mine.snapshot().pendingWaits.map(({ waitId }) => waitId)).toEqual(
      expect.arrayContaining([beaWait.waitId, olgaWait.waitId]),
    )
    await owner.close()
    await submitter.close()
  })

  it('checks a resolve from host.submit against the run of the wait', async () => {
    const { owner, submitter, harness, olgaWait } = await twoWaitingRuns()
    const submit = (user: User) =>
      submitter.submit({
        harness,
        threadId: THREAD,
        user,
        input: {
          op: 'resolve',
          resume: [
            { interruptId: olgaWait.waitId, status: 'resolved', payload: true },
          ],
        },
      })

    await expect(submit(bea)).rejects.toBeInstanceOf(AccessDeniedError)
    expect((await submit(olga)).status).toBe('queued')
    await owner.close()
    await submitter.close()
  })
})

describe('host access and users', () => {
  it('needs a user on each public host call', async () => {
    const { host, harness } = accessHost()

    await expect(host.open(harness, { threadId: THREAD })).rejects.toThrow(
      'host.open needs a user: the host has access.',
    )
    await expect(host.sessions.list()).rejects.toThrow(
      'host.sessions.list needs a user: the host has access.',
    )
    expect(() => host.isOpen(harness, { threadId: THREAD })).toThrow(
      'host.isOpen needs a user: the host has access.',
    )
    await host.close()
  })

  it('refuses a call that acts as another user than the handle', async () => {
    const { host, open } = accessHost()
    const owner = await open(olga)

    expect(() => owner.send('Hi.', { user: bea })).toThrow(
      'This handle acts as "olga". Open another handle for "bea".',
    )
    await host.close()
  })

  it('runs the send of a second opener as that opener, without access', async () => {
    const { plugin, seen } = whoami()
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const harness = defineHarness({
      name: 'test/two-openers',
      adapter: mockAdapter([
        () => toolCall('whoami', {}, 'c1'),
        () => text('ok'),
        () => toolCall('whoami', {}, 'c2'),
        () => text('ok'),
      ]).adapter,
      plugins: () => [plugin],
    })
    const alice = await host.open(harness, {
      threadId: THREAD,
      user: { id: 'alice' },
    })
    const bob = await host.open(harness, {
      threadId: THREAD,
      user: { id: 'bob' },
    })

    await bob.send('Who am I?')
    await alice.send('And me?')

    expect(seen).toEqual(['bob', 'alice'])
    await host.close()
  })

  it("runs the rest of a member's turn as the member after the owner approves it", async () => {
    const { plugin, seen } = whoami()
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({}),
    }).server<HarnessRunContext>((_input, { context }) => {
      seen.push(context.run.user?.id)
      return Promise.resolve({ ok: true })
    })
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: { getUser: (): User | null => null, rules: membersOnly() },
    })
    const harness = defineHarness({
      name: 'test/access-resume',
      adapter: mockAdapter([
        () => toolCall('deploy', {}, 'd1'),
        () => toolCall('whoami', {}, 'w1'),
        () => text('Done.'),
      ]).adapter,
      tools: [deploy],
      plugins: () => [plugin],
    })
    const owner = await host.open(harness, {
      threadId: THREAD,
      user: olga,
    })
    await host.sessions.share({
      threadId: THREAD,
      userId: 'bea',
      role: 'member',
      user: olga,
    })
    const member = await host.open(harness, {
      threadId: THREAD,
      user: bea,
    })
    const turn = await member.send('Deploy, then tell me who I am.')
    const interruptId = turn.interrupts?.[0]?.id
    if (!interruptId) throw new Error('The turn did not stop for the approval.')

    await owner.resolve({
      resume: [{ interruptId, status: 'resolved', payload: true }],
      inputId: 'approve',
    })

    expect(await owner.settled({ inputId: 'approve' })).toMatchObject({
      outcome: 'completed',
    })
    expect(seen).toEqual(['bea', 'bea'])
    await host.close()
  })
})

describe('provider keys with host access', () => {
  it('does not read env vars without allowServerEnvKeys', async () => {
    vi.stubEnv('ACME_TEST_KEY', 'sk-acme-env-0000')
    const keyed = acmeAdapter()
    const { host, open } = accessHost({ adapter: keyed.adapter })
    const owner = await open(olga)

    await expect(owner.send('Hi.')).rejects.toThrow(
      'Sign in to acme first. Run /connect acme.',
    )
    expect(keyed.keys).toEqual([])
    await host.close()
  })

  it('reads env vars with allowServerEnvKeys: true', async () => {
    vi.stubEnv('ACME_TEST_KEY', 'sk-acme-env-0000')
    const keyed = acmeAdapter()
    const { host, open } = accessHost({
      adapter: keyed.adapter,
      allowServerEnvKeys: true,
    })
    const owner = await open(olga)

    expect(await owner.send('Hi.')).toEqual({
      text: 'keyed answer',
      media: [],
    })
    expect(keyed.keys).toEqual(['sk-acme-env-0000'])
    await host.close()
  })
})

it('needs stores.sessions for host access', () => {
  expect(() =>
    createHarnessHost({
      persistence: {
        stores: { log: memoryLogStore() },
      },
      access: { getUser: () => null, rules: membersOnly() },
    }),
  ).toThrow(
    'Host access needs stores.sessions: each session keeps its owner and members there.',
  )
})
