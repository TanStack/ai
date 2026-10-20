import { describe, expect, it, vi } from 'vitest'
import { defineAgent } from '@tanstack/ai'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import {
  AccessDeniedError,
  createHarnessHost,
  defineHarness,
  definePlugin,
  membersOnly,
} from '../src'
import { loadLogState, logIdOf, sessionOf } from '../src/log'
import {
  mockAdapter,
  storedThreadState,
  text,
  untilAborted,
  wrapLogStore,
} from './helpers'
import type { LogStore } from '@tanstack/ai-persistence'
import type { AgentActions, Operation } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

interface User {
  id: string
  tenantId: string
}

const olga: User = { id: 'olga', tenantId: 'acme' }
const bea: User = { id: 'bea', tenantId: 'acme' }
const vic: User = { id: 'vic', tenantId: 'acme' }

const THREAD = 't1'
const NAME = 'test/access-work'

/** An agent whose run goes on until it is cancelled. */
const slow = defineAgent({
  name: 'slow',
  description: 'Runs until it is cancelled',
  run: (ctx) => ctx.chat({ adapter: mockAdapter(untilAborted()).adapter }),
})

/**
 * Wait until `operation` runs. The receipt of an agent run is not awaited:
 * the run answers through its result.
 */
const running = (operation: Operation<unknown>) =>
  waitFor(() => expect(operation.status()).toBe('running'))

/** The op of each input in the log of `THREAD`, and who sent it. */
async function loggedInputs(log: LogStore, tenantId?: string) {
  const state = await loadLogState({
    store: log,
    logId: logIdOf({ tenantId, logId: THREAD }),
    rootThread: THREAD,
  })
  return [...sessionOf(state, THREAD).inputs.values()].map((logged) => ({
    op: logged.input.op,
    by: logged.user?.id,
  }))
}

/** A host with `membersOnly()` access, and a harness with the `slow` agent. */
function accessHost() {
  const persistence = memoryPersistence()
  const host = createHarnessHost({
    persistence,
    access: { getUser: (): User | null => null, rules: membersOnly() },
  })
  const harness = defineHarness({
    name: NAME,
    adapter: mockAdapter(() => text('ok')).adapter,
    agents: [slow],
  })
  const open = (user: User) => host.open(harness, { threadId: THREAD, user })
  const share = (userId: string, role: 'member' | 'viewer') =>
    host.sessions.share({ threadId: THREAD, userId, role, user: olga })
  return { host, harness, open, share, log: persistence.stores.log }
}

describe('who acts on an agent run', () => {
  it('sends to and cancels a run as the user of the run, not as the first user of the session', async () => {
    let agents: AgentActions | undefined
    const starter = definePlugin({
      name: 'test/starter',
      setup: (ctx) => {
        agents = ctx.agents
      },
    })
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const harness = defineHarness({
      name: NAME,
      adapter: mockAdapter(() => text('ok')).adapter,
      agents: [slow],
      plugins: () => [starter],
    })
    // Olga opens the session first.
    await host.open(harness, { threadId: THREAD, user: olga })
    if (!agents) throw new Error('No plugin context.')
    const run = agents.start('slow', undefined, { user: bea })
    await running(run)

    await run.send('Look at the tests first.')
    await run.cancel()

    await expect(run).rejects.toThrow()
    const inputs = await loggedInputs(persistence.stores.log, 'acme')
    expect(
      inputs.filter(
        (input) => input.op === 'agentMessage' || input.op === 'cancel',
      ),
    ).toEqual([
      { op: 'agentMessage', by: 'bea' },
      { op: 'cancel', by: 'bea' },
    ])
    await host.close()
  })

  it('runs handle.agents.<name>.run as the user that it passes, as start does', async () => {
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const harness = defineHarness({
      name: NAME,
      adapter: mockAdapter(() => text('ok')).adapter,
      agents: [slow],
    })
    const system = await host.open(harness, {
      threadId: THREAD,
      user: { id: 'system' },
    })

    const run = system.agents.slow.run(undefined, { user: bea })
    await running(run)

    const inputs = await loggedInputs(persistence.stores.log)
    expect(inputs.filter((input) => input.op === 'agent')).toEqual([
      { op: 'agent', by: 'bea' },
    ])
    await run.cancel()
    await expect(run).rejects.toThrow()
    await host.close()
  })
})

describe('operations that a handle returns', () => {
  it('check access on cancel and send, as the calls of the handle do', async () => {
    const { host, open, share } = accessHost()
    const owner = await open(olga)
    await share('bea', 'member')
    await share('vic', 'viewer')
    const member = await open(bea)
    const viewer = await open(vic)
    const run = owner.agents.slow.start()
    await running(run)

    const seen = viewer.agentRun(run.id)
    if (!seen) throw new Error('The viewer does not see the run.')
    await expect(seen.cancel()).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(seen.send('Stop.')).rejects.toBeInstanceOf(AccessDeniedError)
    // A member may cancel only the runs that the member started.
    await expect(member.operation(run.id)?.cancel()).rejects.toBeInstanceOf(
      AccessDeniedError,
    )
    expect(run.status()).toBe('running')

    const own = member.agents.slow.start()
    await running(own)
    expect((await own.cancel()).status).toBe('accepted')
    await expect(own).rejects.toThrow()
    await run.cancel()
    await expect(run).rejects.toThrow()
    await host.close()
  })

  it('refuses cancel on an operation of a revoked handle, also of its own run', async () => {
    const { host, open, share } = accessHost()
    await open(olga)
    await share('bea', 'member')
    const member = await open(bea)
    const own = member.agents.slow.start()
    await running(own)
    const found = member.agentRun(own.id)
    if (!found) throw new Error('The member does not see the run.')

    await host.revoke({ threadId: THREAD, user: bea })

    await expect(found.cancel()).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(own.cancel()).rejects.toBeInstanceOf(AccessDeniedError)
    await host.close()
  })
})

describe('a user that loses access', () => {
  it('ends a running events() read of a handle and of a view', async () => {
    const { host, harness, open, share } = accessHost()
    const owner = await open(olga)
    await share('bea', 'member')
    const member = await open(bea)
    const view = await host.observe(harness, {
      threadId: THREAD,
      user: bea,
    })
    const readAll = async (events: AsyncIterable<unknown>) => {
      for await (const _event of events) {
        // Read until the read ends.
      }
    }
    const handleRead = readAll(member.events())
    const viewRead = readAll(view.events())
    await owner.send('Hi.')

    await host.sessions.unshare({
      threadId: THREAD,
      userId: 'bea',
      user: olga,
    })

    await expect(handleRead).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(viewRead).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(view.transcript()).rejects.toBeInstanceOf(AccessDeniedError)
    await host.close()
  })

  it('ends an events() read that is first pulled after the revoke', async () => {
    const { host, open, share } = accessHost()
    await open(olga)
    await share('bea', 'member')
    const member = await open(bea)
    const events = member.events()

    await host.revoke({ threadId: THREAD, user: bea })

    const read = (async () => {
      for await (const _event of events) {
        // Read until the read ends.
      }
    })()
    await expect(read).rejects.toBeInstanceOf(AccessDeniedError)
    await host.close()
  })

  it('rejects host.revoke when the work of the user did not stop', async () => {
    const persistence = memoryPersistence()
    let isDown = false
    const log = wrapLogStore(persistence.stores.log, {
      offerInput: (input) =>
        isDown
          ? Promise.reject(new Error('The store is down.'))
          : persistence.stores.log.offerInput(input),
    })
    const host = createHarnessHost({
      persistence: { ...persistence, stores: { ...persistence.stores, log } },
      access: { getUser: (): User | null => null, rules: membersOnly() },
    })
    const harness = defineHarness({
      name: NAME,
      adapter: mockAdapter(() => text('ok')).adapter,
    })
    await host.open(harness, { threadId: THREAD, user: olga })
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
    await member.schedule({
      at: Date.now() + 3_600_000,
      input: { op: 'prompt', message: 'Write the daily summary.' },
    })
    isDown = true

    await expect(host.revoke({ threadId: THREAD, user: bea })).rejects.toThrow(
      'their work did not stop',
    )
    // The access is gone already.
    expect(() => member.transcript()).toThrow(AccessDeniedError)
    await host.close()
  })

  it('has their running work cancelled by host.revoke', async () => {
    const { host, open, share } = accessHost()
    await open(olga)
    await share('bea', 'member')
    const member = await open(bea)
    const run = member.agents.slow.start()
    await running(run)

    await host.revoke({ threadId: THREAD, user: bea })

    await expect(run).rejects.toThrow()
    expect(run.status()).toBe('cancelled')
    await host.close()
  })

  it('has their work and their schedules stopped by an unshare on another host', async () => {
    const logState = memoryLogState()
    const shared = memoryPersistence()
    const on = (log: LogStore) => ({
      ...shared,
      stores: { ...shared.stores, log },
    })
    const access = {
      getUser: (): User | null => null,
      rules: membersOnly(),
    }
    const main = mockAdapter(() => text('ran'))
    const harness = defineHarness({
      name: NAME,
      adapter: main.adapter,
      agents: [slow],
    })
    const log = memoryLogStore({ state: logState })
    const hostA = createHarnessHost({ persistence: on(log), access })
    const hostB = createHarnessHost({
      persistence: on(memoryLogStore({ state: logState })),
      access,
    })
    await hostA.open(harness, { threadId: THREAD, user: olga })
    await hostA.sessions.share({
      threadId: THREAD,
      userId: 'bea',
      role: 'member',
      user: olga,
    })
    const member = await hostA.open(harness, {
      threadId: THREAD,
      user: bea,
    })
    const run = member.agents.slow.start()
    await running(run)
    const { scheduleId } = await member.schedule({
      at: Date.now() + 300,
      input: { op: 'prompt', message: 'Write the daily summary.' },
    })

    // Host B has no session of the thread open.
    await hostB.sessions.unshare({
      threadId: THREAD,
      userId: 'bea',
      user: olga,
    })

    await expect(run).rejects.toThrow()
    expect(run.status()).toBe('cancelled')
    // The time of the schedule passes, and its prompt does not run.
    await waitFor(async () =>
      expect(
        (
          await storedThreadState(log, { threadId: THREAD, tenantId: 'acme' })
        ).schedules.has(scheduleId),
      ).toBe(false),
    )
    expect(JSON.stringify(main.calls)).not.toContain('daily summary')
    await hostA.close()
    await hostB.close()
  })

  it('has their schedules removed at once by an unshare, not at their time', async () => {
    const { host, open, share, log } = accessHost()
    const owner = await open(olga)
    await share('bea', 'member')
    const member = await open(bea)
    // A run of the owner keeps the log owned, so the owner applies offers.
    const run = owner.agents.slow.start()
    await running(run)
    const { scheduleId } = await member.schedule({
      at: Date.now() + 3_600_000,
      input: { op: 'prompt', message: 'Write the daily summary.' },
    })
    const schedules = async () =>
      (await storedThreadState(log, { threadId: THREAD, tenantId: 'acme' }))
        .schedules
    expect((await schedules()).has(scheduleId)).toBe(true)

    await host.sessions.unshare({
      threadId: THREAD,
      userId: 'bea',
      user: olga,
    })

    await waitFor(async () =>
      expect((await schedules()).has(scheduleId)).toBe(false),
    )
    await run.cancel()
    await expect(run).rejects.toThrow()
    await host.close()
  })
})
