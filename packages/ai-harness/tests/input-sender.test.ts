import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, keyedAdapter, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHandler,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { credentialsFor } from '../src/auth'
import { after, gate, mockAdapter, text, toolCall } from './helpers'
import type { LogRecord } from '@tanstack/ai-persistence'
import type {
  HarnessPlugin,
  HarnessRouterContext,
  JoinCandidate,
  Operation,
  TurnInfo,
} from '../src'

const THREAD = 't1'
/** The live ids that the harness adds to the context of every tool call. */
const live = { threadId: THREAD, runId: expect.any(String) }
const alice = { id: 'alice' }
const bob = { id: 'bob' }

/** A tool that keeps who runs it and the context it gets. */
function whoami() {
  const seen: Array<{ principal: string | undefined; context: unknown }> = []
  const tool = toolDefinition({
    name: 'whoami',
    description: 'Who runs this?',
    inputSchema: z.object({}),
  })
  const plugin = definePlugin({
    name: 'test/whoami',
    setup: (ctx) => ({
      tools: [
        tool.server((_input, toolContext) => {
          seen.push({
            principal: ctx.session.principal?.id,
            context: toolContext?.context,
          })
          return Promise.resolve({})
        }),
      ],
    }),
  })
  return { plugin, seen }
}

function durablePersistence() {
  const { runs, metadata, credentials } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), runs, metadata, credentials } }
}

/** An AG-UI `POST run` body with one user message. */
const runBody = (content: string) => ({
  threadId: THREAD,
  runId: 'run-1',
  messages: [{ id: 'm-1', role: 'user', content }],
  tools: [],
  context: [],
})

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
      principal: alice,
    })
    expect(await host.open(harness, { threadId: THREAD, principal: bob })).toBe(
      session,
    )

    await session.prompt('Who am I?', { inputId: 'in-bob', principal: bob })
    // Without a principal, the input is the opener's.
    await session.prompt('And now?', { inputId: 'in-default' })

    expect(seen.map((entry) => entry.principal)).toEqual(['bob', 'alice'])
    const inputs = (await persistence.stores.log.read(THREAD))
      .map((entry): LogRecord => entry.record)
      .filter((record) => record.type === 'harness.input')
      .map((record) => [record['inputId'], record['principal']])
    expect(inputs).toEqual([
      ['in-bob', { id: 'bob' }],
      ['in-default', { id: 'alice' }],
    ])
    await host.close()
  })

  it('runs each request as the principal that authorize returned, never one from the body', async () => {
    const { plugin, seen } = whoami()
    const { adapter } = mockAdapter([
      () => toolCall('whoami', {}, 'c1'),
      () => text('ok'),
      () => toolCall('whoami', {}, 'c2'),
      () => text('ok'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const harness = defineHarness({
      name: 'test/sender-http',
      adapter,
      plugins: () => [plugin],
    })
    const handler = createHarnessHandler({
      host,
      harness,
      authorize: (request) => ({ id: request.headers.get('x-user') ?? '' }),
    })
    const post = (user: string, route: string, body: object) =>
      handler(
        new Request(`http://h.test/${route}`, {
          method: 'POST',
          headers: { 'x-user': user },
          body: JSON.stringify(body),
        }),
      )

    // Alice opens the thread.
    await (await post('alice', 'run', runBody('Hi.'))).text()
    const receipt = await (
      await post('bob', 'control', {
        threadId: THREAD,
        input: { op: 'prompt', message: 'Me?', principal: { id: 'mallory' } },
      })
    ).json()
    const session = await host.open(harness, { threadId: THREAD })
    expect(await session.settled(receipt.inputId)).toMatchObject({
      outcome: 'completed',
    })

    expect(seen.map((entry) => entry.principal)).toEqual(['alice', 'bob'])
    await host.close()
  })

  it("builds the model call of bob's input with bob's key", async () => {
    const keys: Array<string> = []
    const adapter = keyedAdapter('acme', (key) => {
      keys.push(key)
      return mockAdapter([() => text(`answered with ${key}`)]).adapter
    })
    const persistence = memoryPersistence()
    for (const user of ['alice', 'bob']) {
      await persistence.stores.credentials.set(
        { threadId: THREAD, userId: user },
        'acme',
        { type: 'api_key', value: `${user}-key` },
      )
    }
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/sender-keys', adapter }),
      { threadId: THREAD, principal: alice },
    )

    expect((await session.prompt('Hi.', { principal: bob })).text).toBe(
      'answered with bob-key',
    )
    expect((await session.prompt('Hi.')).text).toBe('answered with alice-key')
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
            return candidate.principal?.id === alice.id
          },
        },
      }),
      { threadId: THREAD, principal: alice },
    )

    const turn = session.prompt('Start.')
    await turn.receipt
    await session.steer('Mine.', { inputId: 'in-bob', principal: bob })
    release.open()

    expect(await turn).toEqual({ text: 'first' })
    expect(await session.settled('in-bob')).toMatchObject({
      outcome: 'completed',
    })
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((candidate) => candidate.principal === bob)).toBe(
      true,
    )
    expect(seen.map((entry) => entry.principal)).toEqual(['bob'])
    await host.close()
  })

  it("keeps bob's message out of alice's turn with turnPrincipal, and alice's own steer joins", async () => {
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
        name: 'test/sender-turn-principal',
        adapter,
        plugins: () => [plugin],
        turn: {
          canJoin: (candidate) => {
            candidates.push(candidate)
            return candidate.principal?.id === candidate.turnPrincipal?.id
          },
        },
      }),
      { threadId: THREAD, principal: alice },
    )

    const turn = session.prompt('Start.')
    await started.opened
    await session.steer('Also this.', { inputId: 'in-alice' })
    const bobs = session.prompt('Mine.', {
      busy: 'steer',
      inputId: 'in-bob',
      principal: bob,
    })
    await bobs.receipt
    release.open()

    expect(await turn).toEqual({ text: 'First.Joined.' })
    expect(await session.settled('in-alice')).toMatchObject({
      operationId: turn.id,
    })
    expect(await bobs).toEqual({ text: 'Bob here.' })
    const bobSettled = await session.settled('in-bob')
    expect(bobSettled).toMatchObject({ outcome: 'completed' })
    expect(bobSettled.operationId).not.toBe(turn.id)
    expect(seen.map((entry) => entry.principal)).toEqual(['bob'])
    expect(candidates).toContainEqual(
      expect.objectContaining({ principal: bob, turnPrincipal: alice }),
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
      { threadId: THREAD, principal: alice },
    )

    const turn = session.prompt('Start.')
    await started.opened
    await session.steer('Also this.', { inputId: 'in-alice' })
    const bobs = session.prompt('Mine.', {
      busy: 'steer',
      inputId: 'in-bob',
      principal: bob,
    })
    await bobs.receipt
    release.open()

    expect(await turn).toEqual({ text: 'First.Joined.' })
    expect(await session.settled('in-alice')).toMatchObject({
      operationId: turn.id,
    })
    expect(await bobs).toEqual({ text: 'Bob here.' })
    expect((await session.settled('in-bob')).operationId).not.toBe(turn.id)
    expect(seen.map((entry) => entry.principal)).toEqual(['bob'])
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
              commandSaw.push(session.principal?.id)
              again = session.prompt('Again.')
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
      { threadId: THREAD, principal: alice },
    )

    const turn = session.prompt('Start.')
    await started.opened
    // Bob runs a command while alice's turn runs.
    await session.command('again', undefined, { principal: bob })
    release.open()

    expect(await turn).toEqual({ text: 'First.' })
    expect(commandSaw).toEqual(['bob'])
    expect(await again).toEqual({ text: 'Again.' })
    expect(seen.map((entry) => entry.principal)).toEqual(['bob'])
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
          startWriter.server(() => {
            ctx.agents.start(writer, undefined, { wake: true })
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
      { threadId: THREAD, principal: alice },
    )

    await session.prompt('Start the writer.', { principal: bob })
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    expect(seen.map((entry) => entry.principal)).toEqual(['bob'])
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
          startWriter.server(() => {
            started = ctx.agents.start(writer)
            return Promise.resolve({})
          }),
        ],
      }),
    })
    const persistence = memoryPersistence()
    for (const user of ['alice', 'bob']) {
      await persistence.stores.credentials.set(
        { threadId: THREAD, userId: user },
        'acme',
        { type: 'api_key', value: `${user}-key` },
      )
    }
    const { adapter } = mockAdapter([
      () => toolCall('startWriter', {}, 'c1'),
      () => text('started'),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/sender-agent',
        adapter,
        plugins: () => [starter],
      }),
      { threadId: THREAD, principal: alice },
    )

    await session.prompt('Start the writer.', { principal: bob })
    release.open()

    expect(await started).toBe('drafted')
    expect(keys).toEqual(['bob-key'])
    await host.close()
  })
})

describe('the context of an input', () => {
  it('gives tools the forwardedProps of POST run under the harness context, and stores them with the input', async () => {
    const { plugin, seen } = whoami()
    const { adapter } = mockAdapter([
      () => toolCall('whoami', {}, 'c1'),
      () => text('ok'),
    ])
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const handler = createHarnessHandler({
      host,
      harness: defineHarness({
        name: 'test/context',
        adapter,
        plugins: () => [plugin],
        context: { tenant: 'server', db: 'main' },
      }),
      authorize: () => alice,
    })

    const response = await handler(
      new Request('http://h.test/run', {
        method: 'POST',
        body: JSON.stringify({
          ...runBody('Go.'),
          forwardedProps: { tenant: 'acme', screen: 'settings' },
        }),
      }),
    )
    const body = await response.text()

    // The harness value wins for `tenant`.
    expect(seen).toEqual([
      {
        principal: 'alice',
        context: { tenant: 'server', db: 'main', screen: 'settings', ...live },
      },
    ])
    const inputId =
      /"name":"harness\.input\.applied","value":\{"inputId":"([^"]+)"/.exec(
        body,
      )?.[1]
    const stored = await persistence.stores.inbox.get(inputId ?? '')
    expect(stored).toMatchObject({
      input: {
        op: 'prompt',
        message: 'Go.',
        busy: 'queue',
        context: { tenant: 'acme', screen: 'settings' },
      },
      principal: { id: 'alice' },
    })
    await host.close()
  })

  it('gives tools the context of a control input when the harness has none', async () => {
    const { plugin, seen } = whoami()
    const { adapter } = mockAdapter([
      () => toolCall('whoami', {}, 'c1'),
      () => text('ok'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const harness = defineHarness({
      name: 'test/context-control',
      adapter,
      plugins: () => [plugin],
    })
    const handler = createHarnessHandler({
      host,
      harness,
      authorize: () => alice,
    })

    const receipt = await (
      await handler(
        new Request('http://h.test/control', {
          method: 'POST',
          body: JSON.stringify({
            threadId: THREAD,
            input: {
              op: 'prompt',
              message: 'Go.',
              context: { screen: 'home' },
            },
          }),
        }),
      )
    ).json()
    const session = await host.open(harness, { threadId: THREAD })
    await session.settled(receipt.inputId)

    expect(seen).toEqual([
      { principal: 'alice', context: { screen: 'home', ...live } },
    ])
    await host.close()
  })
})

describe('recovery keeps the sender and the context', () => {
  /** A run plugin that keeps the turn it is set up for, and a tool that reports. */
  function recorder() {
    const turns: Array<TurnInfo | undefined> = []
    const { plugin, seen } = whoami()
    const run = definePlugin({
      name: 'test/turns',
      lifetime: 'run',
      setup: (ctx) => {
        turns.push(ctx.turn)
      },
    })
    return { plugins: (): Array<HarnessPlugin> => [plugin, run], turns, seen }
  }

  const sent = {
    op: 'prompt',
    message: 'go',
    busy: 'queue',
    context: { screen: 'x' },
  }

  it('runs an input that never ran with its sender and context', async () => {
    const persistence = durablePersistence()
    await persistence.stores.log.append(THREAD, 1, [
      {
        type: 'harness.input',
        inputId: 'in-1',
        input: sent,
        principal: { id: 'bob', tenantId: 'org' },
        at: 1,
      },
    ])
    const { plugins, turns, seen } = recorder()
    const { adapter } = mockAdapter([
      () => toolCall('whoami', {}, 'c1'),
      () => text('ok'),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/recover-pending', adapter, plugins }),
      { threadId: THREAD, principal: alice },
    )

    expect(await session.settled('in-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(turns).toEqual([
      expect.objectContaining({
        inputId: 'in-1',
        message: 'go',
        context: { screen: 'x' },
        principal: { id: 'bob', tenantId: 'org' },
      }),
    ])
    expect(seen).toEqual([
      { principal: 'bob', context: { screen: 'x', ...live } },
    ])
    await host.close()
  })

  it('runs a turn whose host stopped again with its message, sender, and context', async () => {
    const persistence = durablePersistence()
    await persistence.stores.log.append(THREAD, 1, [
      {
        type: 'harness.input',
        inputId: 'in-1',
        input: sent,
        principal: { id: 'bob' },
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
    ])
    await persistence.stores.runs.createOrResume({
      runId: 'op-stopped',
      threadId: THREAD,
      startedAt: Date.now() - 60_000,
    })
    await persistence.stores.runs.update('op-stopped', {
      leaseOwner: 'host-gone',
      leaseExpiresAt: Date.now() - 1_000,
      checkpoint: { at: 1, pendingTools: [] },
    })
    const { plugins, turns, seen } = recorder()
    const { adapter } = mockAdapter([
      () => toolCall('whoami', {}, 'c1'),
      () => text('ok'),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/recover-stopped', adapter, plugins }),
      { threadId: THREAD, principal: alice },
    )

    expect(await session.settled('in-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(turns).toEqual([
      expect.objectContaining({
        inputId: 'in-1',
        message: 'go',
        context: { screen: 'x' },
        principal: { id: 'bob' },
      }),
    ])
    expect(seen).toEqual([
      { principal: 'bob', context: { screen: 'x', ...live } },
    ])
    await host.close()
  })
})

describe('the turn where the model is picked', () => {
  it('gives run plugins and adapter() the message, the context, and the sender', async () => {
    const setups: Array<TurnInfo | undefined> = []
    const picks: Array<TurnInfo> = []
    const runPicker = definePlugin({
      name: 'test/run-picker',
      lifetime: 'run',
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
        plugins: () => [sessionPlugin, runPicker],
      }),
      { threadId: THREAD, principal: alice },
    )

    const turn = session.prompt('Pick for me.', {
      inputId: 'in-1',
      principal: bob,
      context: { plan: 'pro' },
    })
    await turn

    const expected = {
      operationId: turn.id,
      inputId: 'in-1',
      message: 'Pick for me.',
      context: { plan: 'pro' },
      principal: bob,
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
      { threadId: THREAD, principal: alice },
    )

    await session.prompt('Route me.', {
      principal: bob,
      context: { plan: 'pro' },
    })

    expect(seen).toEqual([
      expect.objectContaining({
        input: 'Route me.',
        principal: bob,
        context: { plan: 'pro' },
      }),
    ])
    await host.close()
  })
})

describe('the tenant of a principal', () => {
  it('scopes credentials by user and tenant', async () => {
    const seen: Array<unknown> = []
    const read = toolDefinition({
      name: 'readToken',
      description: 'Read the GitHub token',
      inputSchema: z.object({}),
    })
    const plugin = definePlugin({
      name: 'test/token',
      setup: (ctx) => ({
        tools: [
          read.server(async () => {
            const credential = await ctx.credentials.get('github')
            seen.push(credential?.type === 'api_key' ? credential.value : null)
            return {}
          }),
        ],
      }),
    })
    const persistence = memoryPersistence()
    for (const tenantId of ['org-a', 'org-b']) {
      await persistence.stores.credentials.set(
        { threadId: THREAD, userId: 'u1', tenantId },
        'github',
        { type: 'api_key', value: `${tenantId}-token` },
      )
    }
    const { adapter } = mockAdapter([
      () => toolCall('readToken', {}, 'c1'),
      () => text('ok'),
      () => toolCall('readToken', {}, 'c2'),
      () => text('ok'),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/tenant', adapter, plugins: () => [plugin] }),
      { threadId: THREAD, principal: { id: 'u1', tenantId: 'org-a' } },
    )

    await session.prompt('Read it.')
    await session.prompt('Read it again.', {
      principal: { id: 'u1', tenantId: 'org-b' },
    })

    expect(seen).toEqual(['org-a-token', 'org-b-token'])
    await host.close()
  })

  it("reads the tenant's credential when the user has none, and the user's own first", async () => {
    const store = memoryPersistence().stores.credentials
    // Saved without a userId: it belongs to the whole tenant.
    await store.set({ threadId: THREAD, tenantId: 'org-a' }, 'github', {
      type: 'api_key',
      value: 'org-token',
    })
    await store.set({ threadId: THREAD, tenantId: 'org-a' }, 'notion', {
      type: 'api_key',
      value: 'org-notion',
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
    await ada.set('github', { type: 'api_key', value: 'ada-token' })
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
