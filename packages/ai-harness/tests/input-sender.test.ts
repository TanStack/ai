import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, keyedAdapter, toolDefinition } from '@tanstack/ai'
import {
  NO_OWNER_EPOCH,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  logIdOf,
} from '../src'
import { credentialsFor } from '../src/auth'
import { after, gate, mockAdapter, stoppedRun, text, toolCall } from './helpers'
import type { LogRecord } from '@tanstack/ai-persistence'
import type {
  HarnessPlugin,
  HarnessRouterContext,
  HarnessRunContext,
  JoinCandidate,
  Operation,
  TurnInfo,
} from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store, and its key in the other stores. */
const LOG = logIdOf({ logId: THREAD })
const alice = { id: 'alice' }
const bob = { id: 'bob' }

/**
 * A tool that keeps the user of its run, and the context it gets without
 * the run.
 */
function whoami() {
  const seen: Array<{ user: string | undefined; context: unknown }> = []
  const tool = toolDefinition({
    name: 'whoami',
    description: 'Who runs this?',
    inputSchema: z.object({}),
  })
  const plugin = definePlugin({
    name: 'test/whoami',
    setup: () => ({
      tools: [
        tool.server<HarnessRunContext>((_input, toolContext) => {
          const { run, ...context } = toolContext.context
          seen.push({ user: run.user?.id, context })
          return Promise.resolve({})
        }),
      ],
    }),
  })
  return { plugin, seen }
}

function durablePersistence() {
  const { metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), metadata } }
}

describe('the sender of each input', () => {
  it("runs bob's prompt on alice's session as bob, and the log keeps bob", async () => {
    const { plugin, seen } = whoami()
    const { adapter } = mockAdapter([
      () => toolCall('whoami', {}, 'c1'),
      () => text('ok'),
      () => toolCall('whoami', {}, 'c2'),
      () => text('ok'),
    ])
    const persistence = durablePersistence()
    const host = createHarnessHost({ persistence })
    const harness = defineHarness({
      name: 'test/sender',
      adapter,
      plugins: () => [plugin],
    })
    const session = await host.open(harness, {
      threadId: THREAD,
      user: alice,
    })
    // Bob's open reaches the same live session. Without host access, a call
    // may name another sender.
    await host.open(harness, { threadId: THREAD, user: bob })

    await session.send('Who am I?', { inputId: 'in-bob', user: bob })
    // Without a user, the input is the opener's.
    await session.send('And now?', { inputId: 'in-default' })

    expect(seen.map((entry) => entry.user)).toEqual(['bob', 'alice'])
    const inputs = (await persistence.stores.log.read({ logId: LOG }))
      .map((entry): LogRecord => entry.record)
      .filter((record) => record.type === 'harness.input')
      .map((record) => [record['inputId'], record['user']])
    expect(inputs).toEqual([
      ['in-bob', { id: 'bob' }],
      ['in-default', { id: 'alice' }],
    ])
    await host.close()
  })

  it("builds the model call of bob's input with bob's key", async () => {
    const keys: Array<string> = []
    const adapter = keyedAdapter('acme', (key) => {
      keys.push(key)
      return mockAdapter([() => text(`answered with ${key}`)]).adapter
    })
    const persistence = memoryPersistence()
    const credentials = memoryCredentialStore()
    for (const user of ['alice', 'bob']) {
      await credentials.set({
        scope: { threadId: THREAD, userId: user },
        id: 'acme',
        credential: { type: 'api_key', value: `${user}-key` },
      })
    }
    const host = createHarnessHost({ persistence, credentials })
    const session = await host.open(
      defineHarness({ name: 'test/sender-keys', adapter }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    expect((await session.send('Hi.', { user: bob })).text).toBe(
      'answered with bob-key',
    )
    expect((await session.send('Hi.')).text).toBe('answered with alice-key')
    expect(keys).toEqual(['bob-key', 'alice-key'])
    await host.close()
  })

  it('gives canJoin the sender, and a refused steer runs as its own turn for its sender', async () => {
    const { plugin, seen } = whoami()
    const release = gate()
    const { adapter } = mockAdapter([
      after(release.opened, 'first'),
      () => toolCall('whoami', {}, 'c1'),
      () => text('second'),
    ])
    const candidates: Array<JoinCandidate> = []
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/sender-join',
        adapter,
        plugins: () => [plugin],
        turn: {
          canJoin: (candidate) => {
            candidates.push(candidate)
            return candidate.user?.id === alice.id
          },
        },
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    const turn = session.send('Start.')
    await turn.receipt
    await session.send('Mine.', {
      inputId: 'in-bob',
      user: bob,
      mode: 'steer',
    }).receipt
    release.open()

    expect(await turn).toEqual({ text: 'first', media: [] })
    expect(await session.settled({ inputId: 'in-bob' })).toMatchObject({
      outcome: 'completed',
    })
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((candidate) => candidate.user === bob)).toBe(true)
    expect(seen.map((entry) => entry.user)).toEqual(['bob'])
    await host.close()
  })

  it("keeps bob's message out of alice's turn with turnUser, and alice's own steer joins", async () => {
    const { plugin, seen } = whoami()
    const started = gate()
    const release = gate()
    const { adapter } = mockAdapter([
      // The steers wait until alice's turn is in its first model call.
      (request) => (started.open(), after(release.opened, 'First.')(request)),
      () => text('Joined.'),
      () => toolCall('whoami', {}, 'c1'),
      () => text('Bob here.'),
    ])
    const candidates: Array<JoinCandidate> = []
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/sender-turn-user',
        adapter,
        plugins: () => [plugin],
        turn: {
          canJoin: (candidate) => {
            candidates.push(candidate)
            return candidate.user?.id === candidate.turnUser?.id
          },
        },
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    const turn = session.send('Start.')
    await started.opened
    await session.send('Also this.', { inputId: 'in-alice', mode: 'steer' })
      .receipt
    const bobs = session.send('Mine.', {
      busy: 'steer',
      inputId: 'in-bob',
      user: bob,
    })
    await bobs.receipt
    release.open()

    expect(await turn).toEqual({ text: 'First.Joined.', media: [] })
    expect(await session.settled({ inputId: 'in-alice' })).toMatchObject({
      operationId: turn.id,
    })
    expect(await bobs).toEqual({ text: 'Bob here.', media: [] })
    const bobSettled = await session.settled({ inputId: 'in-bob' })
    expect(bobSettled).toMatchObject({ outcome: 'completed' })
    expect(bobSettled.operationId).not.toBe(turn.id)
    expect(seen.map((entry) => entry.user)).toEqual(['bob'])
    expect(candidates).toContainEqual(
      expect.objectContaining({ user: bob, turnUser: alice }),
    )
    await host.close()
  })

  it("keeps another person's steer out of a running turn without canJoin, and runs it as its own turn", async () => {
    const { plugin, seen } = whoami()
    const started = gate()
    const release = gate()
    const { adapter } = mockAdapter([
      (request) => (started.open(), after(release.opened, 'First.')(request)),
      () => text('Joined.'),
      () => toolCall('whoami', {}, 'c1'),
      () => text('Bob here.'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/sender-default-join',
        adapter,
        plugins: () => [plugin],
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    const turn = session.send('Start.')
    await started.opened
    await session.send('Also this.', { inputId: 'in-alice', mode: 'steer' })
      .receipt
    const bobs = session.send('Mine.', {
      busy: 'steer',
      inputId: 'in-bob',
      user: bob,
    })
    await bobs.receipt
    release.open()

    expect(await turn).toEqual({ text: 'First.Joined.', media: [] })
    expect(await session.settled({ inputId: 'in-alice' })).toMatchObject({
      operationId: turn.id,
    })
    expect(await bobs).toEqual({ text: 'Bob here.', media: [] })
    expect((await session.settled({ inputId: 'in-bob' })).operationId).not.toBe(
      turn.id,
    )
    expect(seen.map((entry) => entry.user)).toEqual(['bob'])
    await host.close()
  })

  it("binds a command's session to the person who runs it", async () => {
    const { plugin, seen } = whoami()
    const started = gate()
    const release = gate()
    const { adapter } = mockAdapter([
      (request) => (started.open(), after(release.opened, 'First.')(request)),
      () => toolCall('whoami', {}, 'c1'),
      () => text('Again.'),
    ])
    const commandSaw: Array<string | undefined> = []
    let again: Operation<unknown> | undefined
    const commands = definePlugin({
      name: 'test/commands',
      setup: () => ({
        commands: {
          again: defineCommand({
            description: 'Ask again',
            run: (_input, { session }) => {
              commandSaw.push(session.user?.id)
              again = session.send('Again.')
              return 'ok'
            },
          }),
        },
      }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/sender-command',
        adapter,
        plugins: () => [plugin, commands],
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    const turn = session.send('Start.')
    await started.opened
    // Bob runs a command while alice's turn runs.
    await session.runCommand({ name: 'again', user: bob })
    release.open()

    expect(await turn).toEqual({ text: 'First.', media: [] })
    expect(commandSaw).toEqual(['bob'])
    expect(await again).toEqual({ text: 'Again.', media: [] })
    expect(seen.map((entry) => entry.user)).toEqual(['bob'])
    await host.close()
  })

  it('runs the wake turn of a background agent as the person who started it', async () => {
    const { plugin, seen } = whoami()
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes',
      run: () => Promise.resolve('drafted'),
    })
    const startWriter = toolDefinition({
      name: 'startWriter',
      description: 'Start the writer',
      inputSchema: z.object({}),
    })
    const starter = definePlugin({
      name: 'test/starter',
      setup: (ctx) => ({
        tools: [
          startWriter.server<HarnessRunContext>((_input, toolContext) => {
            ctx.agents.start(writer, undefined, {
              startTurnWhenDone: true,
              user: toolContext.context.run.user,
            })
            return Promise.resolve({})
          }),
        ],
      }),
    })
    const { adapter } = mockAdapter([
      () => toolCall('startWriter', {}, 'c1'),
      () => text('started'),
      // The wake turn.
      () => toolCall('whoami', {}, 'c2'),
      () => text('woke'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/sender-wake',
        adapter,
        plugins: () => [plugin, starter],
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    await session.send('Start the writer.', { user: bob })
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen.map((entry) => entry.user)).toEqual(['bob'])
    await host.close()
  })

  it("runs a background agent that bob's turn starts with bob's key, after that turn ends", async () => {
    const release = gate()
    const keys: Array<string> = []
    const keyed = keyedAdapter('acme', (key) => {
      keys.push(key)
      return mockAdapter([() => text('drafted')]).adapter
    })
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes',
      run: async (ctx) => {
        await release.opened
        return ctx.chat({
          adapter: await ctx.keys.adapter(keyed),
          stream: false,
        })
      },
    })
    let started: Operation<unknown> | undefined
    const startWriter = toolDefinition({
      name: 'startWriter',
      description: 'Start the writer',
      inputSchema: z.object({}),
    })
    const starter = definePlugin({
      name: 'test/starter',
      setup: (ctx) => ({
        tools: [
          startWriter.server<HarnessRunContext>((_input, toolContext) => {
            started = ctx.agents.start(writer, undefined, {
              user: toolContext.context.run.user,
            })
            return Promise.resolve({})
          }),
        ],
      }),
    })
    const persistence = memoryPersistence()
    const credentials = memoryCredentialStore()
    for (const user of ['alice', 'bob']) {
      await credentials.set({
        scope: { threadId: THREAD, userId: user },
        id: 'acme',
        credential: { type: 'api_key', value: `${user}-key` },
      })
    }
    const { adapter } = mockAdapter([
      () => toolCall('startWriter', {}, 'c1'),
      () => text('started'),
    ])
    const host = createHarnessHost({ persistence, credentials })
    const session = await host.open(
      defineHarness({
        name: 'test/sender-agent',
        adapter,
        plugins: () => [starter],
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    await session.send('Start the writer.', { user: bob })
    release.open()

    expect(await started).toBe('drafted')
    expect(keys).toEqual(['bob-key'])
    await host.close()
  })
})

describe('recovery keeps the sender and the context', () => {
  /** A turn plugin that keeps the turn it is set up for, and a tool that reports. */
  function recorder() {
    const turns: Array<TurnInfo | undefined> = []
    const { plugin, seen } = whoami()
    const perTurn = definePlugin({
      name: 'test/turns',
      lifetime: 'turn',
      setup: (ctx) => {
        turns.push(ctx.turn)
      },
    })
    return {
      plugins: (): Array<HarnessPlugin> => [plugin, perTurn],
      turns,
      seen,
    }
  }

  const sent = {
    op: 'prompt',
    message: 'go',
    busy: 'queue',
    context: { screen: 'x' },
  }

  it('runs an input that never ran with its sender and context', async () => {
    const persistence = durablePersistence()
    await persistence.stores.log.append({
      logId: LOG,
      seq: 1,
      epoch: NO_OWNER_EPOCH,
      records: [
        {
          type: 'harness.input',
          inputId: 'in-1',
          input: sent,
          user: { id: 'bob', tenantId: 'org' },
          at: 1,
        },
      ],
    })
    const { plugins, turns, seen } = recorder()
    const { adapter } = mockAdapter([
      () => toolCall('whoami', {}, 'c1'),
      () => text('ok'),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/recover-pending',
        adapter,
        plugins,
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    expect(await session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'completed',
    })
    expect(turns).toEqual([
      expect.objectContaining({
        inputId: 'in-1',
        message: 'go',
        context: { screen: 'x' },
        user: { id: 'bob', tenantId: 'org' },
      }),
    ])
    expect(seen).toEqual([{ user: 'bob', context: { screen: 'x' } }])
    await host.close()
  })

  it('runs a turn whose host stopped again with its message, sender, and context', async () => {
    const persistence = durablePersistence()
    await persistence.stores.log.append({
      logId: LOG,
      seq: 1,
      epoch: NO_OWNER_EPOCH,
      records: [
        {
          type: 'harness.input',
          inputId: 'in-1',
          input: sent,
          user: { id: 'bob' },
          at: 1,
        },
        {
          type: 'harness.input.applied',
          inputId: 'in-1',
          operationId: 'op-stopped',
          attempt: 1,
        },
        {
          type: 'harness.transcript',
          keep: 0,
          add: [{ id: 'u1', role: 'user', content: 'go' }],
        },
        stoppedRun('op-stopped', THREAD, {
          checkpoint: { at: 1, pendingTools: [] },
        }),
      ],
    })
    const { plugins, turns, seen } = recorder()
    const { adapter } = mockAdapter([
      () => toolCall('whoami', {}, 'c1'),
      () => text('ok'),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/recover-stopped',
        adapter,
        plugins,
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    expect(await session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'completed',
    })
    expect(turns).toEqual([
      expect.objectContaining({
        inputId: 'in-1',
        message: 'go',
        context: { screen: 'x' },
        user: { id: 'bob' },
      }),
    ])
    expect(seen).toEqual([{ user: 'bob', context: { screen: 'x' } }])
    await host.close()
  })
})

describe('the turn where the model is picked', () => {
  it('gives turn plugins and adapter() the message, the context, and the sender', async () => {
    const setups: Array<TurnInfo | undefined> = []
    const picks: Array<TurnInfo> = []
    const turnPicker = definePlugin({
      name: 'test/turn-picker',
      lifetime: 'turn',
      setup: (ctx) => {
        setups.push(ctx.turn)
        return {
          adapter: (turn) => {
            picks.push(turn)
            return undefined
          },
        }
      },
    })
    const sessionTurns: Array<TurnInfo | undefined> = []
    const sessionPlugin = definePlugin({
      name: 'test/session-plugin',
      setup: (ctx) => {
        sessionTurns.push(ctx.turn)
      },
    })
    const { adapter } = mockAdapter([() => text('ok')])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/picker-turn',
        adapter,
        plugins: () => [sessionPlugin, turnPicker],
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    const turn = session.send('Pick for me.', {
      inputId: 'in-1',
      user: bob,
      context: { plan: 'pro' },
    })
    await turn

    const expected = {
      operationId: turn.id,
      inputId: 'in-1',
      message: 'Pick for me.',
      context: { plan: 'pro' },
      user: bob,
      run: expect.objectContaining({
        user: { id: 'bob' },
        runId: turn.id,
        threadId: THREAD,
      }),
    }
    expect(setups).toEqual([expected])
    expect(picks).toEqual([expected])
    expect(sessionTurns).toEqual([undefined])
    await host.close()
  })

  it('gives the router the sender and the context', async () => {
    const seen: Array<HarnessRouterContext> = []
    const helper = defineAgent({
      name: 'helper',
      description: 'Helps',
      run: () => Promise.resolve('help'),
    })
    const { adapter } = mockAdapter([() => text('ok')])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/router-turn',
        adapter,
        agents: [helper],
        routing: {
          router: (ctx) => {
            seen.push(ctx)
            return 'main'
          },
        },
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    await session.send('Route me.', {
      user: bob,
      context: { plan: 'pro' },
    })

    expect(seen).toEqual([
      expect.objectContaining({
        input: 'Route me.',
        user: bob,
        context: { plan: 'pro' },
      }),
    ])
    await host.close()
  })
})

describe('the tenant of a user', () => {
  it('scopes credentials by user and tenant', async () => {
    const seen: Array<unknown> = []
    const read = toolDefinition({
      name: 'readToken',
      description: 'Read the GitHub token',
      inputSchema: z.object({}),
    })
    const plugin = definePlugin({
      name: 'test/token',
      setup: () => ({
        tools: [
          read.server<HarnessRunContext>(async (_input, toolContext) => {
            const credential =
              await toolContext.context.run.credentials.get('github')
            seen.push(credential?.type === 'api_key' ? credential.value : null)
            return {}
          }),
        ],
      }),
    })
    const persistence = memoryPersistence()
    const credentials = memoryCredentialStore()
    for (const tenantId of ['org-a', 'org-b']) {
      await credentials.set({
        scope: { threadId: THREAD, userId: 'u1', tenantId },
        id: 'github',
        credential: { type: 'api_key', value: `${tenantId}-token` },
      })
    }
    const { adapter } = mockAdapter([
      () => toolCall('readToken', {}, 'c1'),
      () => text('ok'),
      () => toolCall('readToken', {}, 'c2'),
      () => text('ok'),
    ])
    const host = createHarnessHost({ persistence, credentials })
    const session = await host.open(
      defineHarness({
        name: 'test/tenant',
        adapter,
        plugins: () => [plugin],
      }),
      {
        threadId: THREAD,
        user: { id: 'u1', tenantId: 'org-a' },
      },
    )

    await session.send('Read it.')
    await session.send('Read it again.', {
      user: { id: 'u1', tenantId: 'org-b' },
    })

    expect(seen).toEqual(['org-a-token', 'org-b-token'])
    await host.close()
  })

  it("reads the tenant's credential when the user has none, and the user's own first", async () => {
    const store = memoryCredentialStore()
    // Saved without a userId: it belongs to the whole tenant.
    await store.set({
      scope: { threadId: THREAD, tenantId: 'org-a' },
      id: 'github',
      credential: {
        type: 'api_key',
        value: 'org-token',
      },
    })
    await store.set({
      scope: { threadId: THREAD, tenantId: 'org-a' },
      id: 'notion',
      credential: {
        type: 'api_key',
        value: 'org-notion',
      },
    })
    const access = (userId: string, tenantId: string) =>
      credentialsFor(store, { threadId: THREAD, userId, tenantId }, () => {})

    const ada = access('ada', 'org-a')
    expect(await ada.require('github')).toEqual({
      type: 'api_key',
      value: 'org-token',
    })
    // A user of another tenant does not see it.
    expect(await access('ada', 'org-b').get('github')).toBeNull()

    // The user's own credential wins, and a save goes to the user only.
    await ada.set({
      id: 'github',
      credential: { type: 'api_key', value: 'ada-token' },
    })
    expect(await ada.get('github')).toEqual({
      type: 'api_key',
      value: 'ada-token',
    })
    expect(await access('bob', 'org-a').get('github')).toEqual({
      type: 'api_key',
      value: 'org-token',
    })
    expect(await ada.list()).toEqual([
      { id: 'github', type: 'api_key' },
      { id: 'notion', type: 'api_key' },
    ])
  })
})
