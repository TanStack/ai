import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { applyInput } from '../src/server'
import { after, gate, mockAdapter, text, toolCall } from './helpers'
import type { AnyTool, AnyTextAdapter } from '@tanstack/ai'
import type { Credential } from '@tanstack/ai/byok'
import type { LogRecord } from '@tanstack/ai-persistence'
import type {
  AgentRun,
  HarnessInput,
  HarnessPlugin,
  HarnessRunContext,
} from '../src'

const THREAD = 't1'
/** Opens the session. She has a token too, so a fall back to her shows. */
const olga = { id: 'olga' }
const alice = { id: 'alice' }
const bob = { id: 'bob' }

const SESSION_CREDENTIALS =
  'ctx.credentials of a session plugin has no user. In a tool or a middleware hook, read ctx.context.run.credentials. In a command, use the credentials of its run context.'
const SESSION_KEYS =
  'ctx.keys of a session plugin has no user. In a tool or a middleware hook, read ctx.context.run.keys. In a command, use the keys of its run context.'

/** A credential store where each of olga, alice, and bob has a GitHub token. */
async function tokens() {
  const store = memoryCredentialStore()
  for (const user of ['olga', 'alice', 'bob']) {
    await store.set({
      scope: { threadId: THREAD, userId: user },
      id: 'github',
      credential: { type: 'api_key', value: `${user}-token` },
    })
  }
  return store
}

/** The value of an `api_key` credential, else `null`. */
const valueOf = (credential: Credential | null) =>
  credential?.type === 'api_key' ? credential.value : null

/** A tool that keeps the user of its run and that user's GitHub token. */
function tokenReader() {
  const seen: Array<{ user: string | undefined; token: string | null }> = []
  const tool = toolDefinition({
    name: 'read_token',
    description: 'Read the GitHub token',
    inputSchema: z.object({}),
  }).server<HarnessRunContext>(async (_input, { context }) => {
    const credential = await context.run.credentials.get('github')
    seen.push({ user: context.run.principal?.id, token: valueOf(credential) })
    return {}
  })
  return { tool, seen }
}

/** A host with the tokens of every user, and a session that olga opens. */
async function open(options: {
  adapter: AnyTextAdapter
  plugins: () => Array<HarnessPlugin>
}) {
  const host = createHarnessHost({
    persistence: memoryPersistence(),
    credentials: await tokens(),
  })
  const harness = defineHarness({
    name: 'test/run-context',
    adapter: options.adapter,
    plugins: options.plugins,
  })
  const session = await host.open(harness, {
    threadId: THREAD,
    principal: olga,
  })
  return { host, harness, session }
}

describe('the run context of each run', () => {
  it("gives a background agent's tool the credential of the user who started it, while another user's turn runs", async () => {
    const bobRunning = gate()
    const agentFinished = gate()
    const reader = tokenReader()
    const agentTools: Array<AnyTool> = [reader.tool]
    const agentModel = mockAdapter([
      () => toolCall('read_token', {}, 'a1'),
      () => text('agent done'),
    ])
    const worker = defineAgent({
      name: 'worker',
      description: 'Reads the token later',
      run: async (ctx) => {
        // The tool runs only while bob's turn runs.
        await bobRunning.opened
        return ctx.chat({
          adapter: agentModel.adapter,
          tools: agentTools,
          stream: false,
        })
      },
    })
    let started: AgentRun<unknown> | undefined
    const starter = definePlugin({
      name: 'test/starter',
      setup: (ctx) => ({
        tools: [
          toolDefinition({
            name: 'start_worker',
            description: 'Start the worker',
            inputSchema: z.object({}),
          }).server<HarnessRunContext>((_input, { context }) => {
            started = ctx.agents.start(worker, undefined, {
              principal: context.run.principal,
            })
            return Promise.resolve({})
          }),
        ],
      }),
    })
    const { adapter } = mockAdapter([
      () => toolCall('start_worker', {}, 'c1'),
      () => text('started'),
      // Bob's turn waits until the agent ended.
      (request) => (
        bobRunning.open(),
        after(agentFinished.opened, 'bob done')(request)
      ),
    ])
    const { host, session } = await open({ adapter, plugins: () => [starter] })

    await session.send('Start the worker.', { principal: alice })
    const bobTurn = session.send('Hi.', { principal: bob })
    expect(await started).toBe('agent done')
    agentFinished.open()

    expect(await bobTurn).toEqual({ text: 'bob done', media: [] })
    expect(reader.seen).toEqual([{ user: 'alice', token: 'alice-token' }])
    await host.close()
  })

  it("gives a tool of bob's turn bob's credential", async () => {
    const reader = tokenReader()
    const tools = definePlugin({
      name: 'test/tools',
      setup: () => ({ tools: [reader.tool] }),
    })
    const { adapter } = mockAdapter([
      () => toolCall('read_token', {}, 'c1'),
      () => text('ok'),
    ])
    const { host, session } = await open({ adapter, plugins: () => [tools] })

    await session.send('Read it.', { principal: bob })

    expect(reader.seen).toEqual([{ user: 'bob', token: 'bob-token' }])
    await host.close()
  })

  it("throws for a session plugin's credentials and keys, and its session principal is the opener", async () => {
    const seen: Array<{
      principal: string | undefined
      errors: Array<string>
    }> = []
    const errorOf = (error: unknown) =>
      error instanceof Error ? error.message : String(error)
    const probe = definePlugin({
      name: 'test/probe',
      setup: (ctx) => ({
        tools: [
          toolDefinition({
            name: 'probe',
            description: 'Use the session services',
            inputSchema: z.object({}),
          }).server(async () => {
            const errors = await Promise.all([
              ctx.credentials.get('github').then(() => 'read', errorOf),
              ctx.keys.require('acme').then(() => 'read', errorOf),
            ])
            seen.push({ principal: ctx.session.principal?.id, errors })
            return {}
          }),
        ],
      }),
    })
    const { adapter } = mockAdapter([
      () => toolCall('probe', {}, 'c1'),
      () => text('ok'),
    ])
    const { host, session } = await open({ adapter, plugins: () => [probe] })

    await session.send('Probe.', { principal: bob })

    expect(seen).toEqual([
      { principal: 'olga', errors: [SESSION_CREDENTIALS, SESSION_KEYS] },
    ])
    await host.close()
  })

  it("binds a turn plugin's credentials and session to the sender of its turn", async () => {
    const seen: Array<{ principal: string | undefined; token: string | null }> =
      []
    const perTurn = definePlugin({
      name: 'test/per-turn',
      lifetime: 'turn',
      setup: (ctx) => ({
        tools: [
          toolDefinition({
            name: 'read_token',
            description: 'Read the GitHub token',
            inputSchema: z.object({}),
          }).server(async () => {
            const credential = await ctx.credentials.get('github')
            seen.push({
              principal: ctx.session.principal?.id,
              token: valueOf(credential),
            })
            return {}
          }),
        ],
      }),
    })
    const { adapter } = mockAdapter([
      () => toolCall('read_token', {}, 'c1'),
      () => text('ok'),
      () => toolCall('read_token', {}, 'c2'),
      () => text('ok'),
    ])
    const { host, session } = await open({ adapter, plugins: () => [perTurn] })

    await session.send('Read it.', { principal: bob })
    await session.send('Read it.', { principal: alice })

    expect(seen).toEqual([
      { principal: 'bob', token: 'bob-token' },
      { principal: 'alice', token: 'alice-token' },
    ])
    await host.close()
  })

  it('replaces a run that a client sends in the context with the run of the server', async () => {
    const seen: Array<{
      user: unknown
      token: string | null
      screen: unknown
    }> = []
    const peek = definePlugin({
      name: 'test/peek',
      setup: () => ({
        tools: [
          toolDefinition({
            name: 'peek',
            description: 'Read the context',
            inputSchema: z.object({}),
          }).server<HarnessRunContext & { screen?: unknown }>(
            async (_input, { context }) => {
              const credential = await context.run.credentials.get('github')
              seen.push({
                user: context.run.principal,
                token: valueOf(credential),
                screen: context.screen,
              })
              return {}
            },
          ),
        ],
      }),
    })
    const { adapter } = mockAdapter([
      () => toolCall('peek', {}, 'c1'),
      () => text('ok'),
    ])
    const { host, harness, session } = await open({
      adapter,
      plugins: () => [peek],
    })

    await applyInput({
      harness,
      session,
      input: {
        op: 'prompt',
        message: 'Peek.',
        inputId: 'in-1',
        context: { screen: 'settings', run: { principal: { id: 'mallory' } } },
      },
      principal: bob,
    })
    expect(await session.settled('in-1')).toMatchObject({
      outcome: 'completed',
    })

    expect(seen).toEqual([
      { user: { id: 'bob' }, token: 'bob-token', screen: 'settings' },
    ])
    await host.close()
  })
})

describe('the sender of each control input', () => {
  /** The `op` of a logged input. */
  const opOf = (record: LogRecord) => {
    const { input } = record
    return typeof input === 'object' && input !== null && 'op' in input
      ? input.op
      : undefined
  }

  it('logs the principal that sent a cancel, an answer, a delivery change, a config change, and an agent run', async () => {
    const log = memoryLogStore()
    const { runs, metadata } = memoryPersistence().stores
    const host = createHarnessHost({
      persistence: { stores: { log, runs, metadata } },
    })
    const noop = defineAgent({
      name: 'noop',
      description: 'Does nothing',
      run: () => Promise.resolve('ok'),
    })
    const harness = defineHarness({
      name: 'test/control-sender',
      adapter: mockAdapter([]).adapter,
      agents: [noop],
      expose: { agents: ['noop'], config: ['missing'] },
    })
    const session = await host.open(harness, {
      threadId: THREAD,
      principal: olga,
    })
    const inputs: Array<HarnessInput> = [
      { op: 'cancel' },
      { op: 'cancelInput', inputId: 'none' },
      { op: 'setDelivery', inputId: 'none', delivery: 'steer' },
      { op: 'answer', questionId: 'none', value: 'yes' },
      { op: 'config', key: 'missing', value: 1 },
      { op: 'agent', agent: 'noop' },
    ]

    for (const input of inputs) {
      await applyInput({ harness, session, input, principal: bob })
    }
    await session.whenIdle()

    const logged = (await log.read({ logId: THREAD }))
      .map((entry) => entry.record)
      .filter((record) => record.type === 'harness.input')
      .map((record) => [opOf(record), record['principal']])
    expect(logged).toEqual([
      ['cancel', { id: 'bob' }],
      ['cancelInput', { id: 'bob' }],
      ['setDelivery', { id: 'bob' }],
      ['answer', { id: 'bob' }],
      ['config', { id: 'bob' }],
      ['agent', { id: 'bob' }],
    ])
    await host.close()
  })
})
