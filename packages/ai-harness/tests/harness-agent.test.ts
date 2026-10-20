import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, chat, toolDefinition } from '@tanstack/ai'
import { defineByokProvider, keyedAdapter } from '@tanstack/ai/byok'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  harnessAgent,
  logIdOf,
} from '../src'
import { hostCountsOf } from '../src/host'
import { SessionImpl } from '../src/session/harness-session'
import { mockAdapter, text, toolCall } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { AnyHarness } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

afterEach(() => {
  vi.unstubAllEnvs()
})

/** `chunks` with `tokens` tokens on the RUN_FINISHED of the model call. */
function withTokens(chunks: Array<StreamChunk>, tokens: number) {
  return chunks.map((chunk) =>
    chunk.type === EventType.RUN_FINISHED
      ? {
          ...chunk,
          usage: {
            promptTokens: tokens - 10,
            completionTokens: 10,
            totalTokens: tokens,
          },
        }
      : chunk,
  )
}

/** A tool that does nothing, for a child model call that calls a tool. */
const noop = toolDefinition({
  name: 'noop',
  description: 'Does nothing',
  inputSchema: z.object({}),
}).server(() => Promise.resolve({ ok: true }))

/** A plugin of the child harness that counts its disposes. */
function disposable() {
  const disposed = vi.fn()
  const plugin = definePlugin({
    name: 'test/child-plugin',
    setup: async (ctx) => {
      await ctx.resources.acquire(
        () => undefined,
        () => disposed(),
      )
    },
  })
  return { plugin, disposed }
}

/** A lead harness whose model calls the child `child` once, then says `Done.`. */
function lead(child: AnyHarness, extra: { agents?: boolean } = {}) {
  const agent = harnessAgent(child)
  const model = mockAdapter([
    () => toolCall(agent.name, { prompt: 'Do it.' }),
    () => text('Done.'),
  ])
  const harness = defineHarness({
    name: 'test/lead',
    adapter: model.adapter,
    subagents: { agents: [agent] },
    ...(extra.agents ? { agents: [agent] } : {}),
  })
  return { harness, model, agent }
}

describe('harnessAgent in a harness session', () => {
  it('writes the child into the log of the root thread, on a child thread that host.open refuses', async () => {
    const log = memoryLogStore()
    const { metadata, sessions } = memoryPersistence().stores
    const written = new Set<string>()
    const append = log.append.bind(log)
    vi.spyOn(log, 'append').mockImplementation((batch) => {
      written.add(batch.logId)
      return append(batch)
    })
    const child = defineHarness({
      name: 'test/child',
      adapter: mockAdapter([() => text('Child answer.')]).adapter,
    })
    const { harness, model } = lead(child)
    const host = createHarnessHost({
      persistence: { stores: { log, metadata, sessions } },
    })
    const session = await host.open(harness, { threadId: 't' })

    await expect(session.send('Go.')).resolves.toMatchObject({ text: 'Done.' })
    expect(JSON.stringify(model.calls[1]?.messages)).toContain('Child answer.')

    // One log: the log of the root thread.
    expect([...written]).toEqual([logIdOf({ logId: 't' })])
    const threads = (await log.read({ logId: logIdOf({ logId: 't' }) }))
      .map((entry) => entry.record.thread)
      .filter((thread) => typeof thread === 'string')
    const childThread = threads.find((thread) =>
      String(thread).startsWith('t/agent/'),
    )
    expect(childThread).toBeDefined()
    // The index entry names harness B and the parent thread.
    expect(
      await sessions?.get({ threadId: String(childThread) }),
    ).toMatchObject({ harness: 'test/child', parentThreadId: 't' })
    await expect(
      host.open(child, { threadId: String(childThread) }),
    ).rejects.toThrow('harnessAgent child')
    await host.close()
  })

  it('opens an app thread id with /agent/ in it, when no thread is before it', async () => {
    const harness = defineHarness({
      name: 'test/notes',
      adapter: mockAdapter([]).adapter,
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })

    await expect(
      host.open(harness, { threadId: 'org/agent/notes' }),
    ).resolves.toBeDefined()
    // `org/agent/notes` is a thread now, so the ids under it are reserved.
    await expect(
      host.open(harness, { threadId: 'org/agent/notes/agent/run-1' }),
    ).rejects.toThrow('harnessAgent child')
    await host.close()
  })

  it('refuses a thread id with /inner/ from app code, also when the thread before it does not exist', async () => {
    const harness = defineHarness({
      name: 'test/notes',
      adapter: mockAdapter([]).adapter,
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const refused = 'harnessText inner session'

    await expect(host.open(harness, { threadId: 'X/inner/h' })).rejects.toThrow(
      refused,
    )
    await expect(
      host.submit({
        harness,
        threadId: 'X/inner/h',
        input: { op: 'prompt', message: 'Hi.' },
      }),
    ).rejects.toThrow(refused)
    await host.open(harness, { threadId: 'X' })
    await expect(
      host.fork(harness, { threadId: 'X', newThreadId: 'X/inner/h' }),
    ).rejects.toThrow(refused)
    await host.close()
  })

  it('runs the child for the user of the run, with the keys of that user', async () => {
    vi.stubEnv('ACME_TEST_KEY', '')
    const acme = defineByokProvider({
      id: 'acme',
      label: 'Acme',
      env: 'ACME_TEST_KEY',
    })
    const keys: Array<string> = []
    const inner = mockAdapter([() => text('as a'), () => text('as b')])
    const child = defineHarness({
      name: 'test/keyed-child',
      adapter: keyedAdapter(acme, (key) => {
        keys.push(key)
        return inner.adapter
      }),
    })
    const agent = harnessAgent(child)
    const outer = mockAdapter([
      () => toolCall(agent.name, { prompt: 'One.' }),
      () => text('First.'),
      () => toolCall(agent.name, { prompt: 'Two.' }, 'call-2'),
      () => text('Second.'),
    ])
    const credentials = memoryCredentialStore()
    const save = (userId: string, value: string) =>
      credentials.set({
        scope: { threadId: 't', userId },
        id: 'acme',
        credential: { type: 'api_key', value },
      })
    await save('user-a', 'sk-acme-a-1234')
    await save('user-b', 'sk-acme-b-5678')
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      credentials,
    })
    const harness = defineHarness({
      name: 'test/keyed-lead',
      adapter: outer.adapter,
      subagents: { agents: [agent] },
    })
    const a = await host.open(harness, {
      threadId: 't',
      user: { id: 'user-a' },
    })
    const b = await host.open(harness, {
      threadId: 't',
      user: { id: 'user-b' },
    })

    await expect(a.send('Go.')).resolves.toMatchObject({ text: 'First.' })
    await expect(b.send('Go.')).resolves.toMatchObject({ text: 'Second.' })
    expect(keys).toEqual(['sk-acme-a-1234', 'sk-acme-b-5678'])
    await host.close()
  })

  it('counts the child model calls in the root usage, and the budget of the run stops the child', async () => {
    const inner = mockAdapter([
      () => withTokens(toolCall('noop', {}), 60),
      () => text('never'),
    ])
    const child = defineHarness({
      name: 'test/spending-child',
      adapter: inner.adapter,
      tools: [noop],
    })
    const { harness } = lead(child, { agents: true })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't' })

    const run = session.agent('test_spending-child')?.start(undefined, {
      budget: { maxTokens: 50 },
    })
    if (!run) throw new Error('The agent is not there.')
    await expect(run).rejects.toMatchObject({ code: 'budget' })
    expect(inner.calls).toHaveLength(1)
    expect(session.usage().total.totalTokens).toBe(60)
    await waitFor(() => expect(hostCountsOf(host).children).toBe(0))
    await host.close()
  })

  it('lists a wait of the child in the root session, and an answer there resumes the child', async () => {
    const deployed: Array<string> = []
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({ target: z.string() }),
    }).server(({ target }) => {
      deployed.push(target)
      return Promise.resolve({ deployed: true })
    })
    const { plugin, disposed } = disposable()
    const child = defineHarness({
      name: 'test/deployer',
      adapter: mockAdapter([
        () => toolCall('deploy', { target: 'prod' }),
        () => text('Deployed.'),
      ]).adapter,
      tools: [deploy],
      plugins: () => [plugin],
    })
    const { harness, model } = lead(child)
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't' })

    const turn = session.send('Ship it.')
    await waitFor(() => expect(session.snapshot().pendingWaits).toHaveLength(1))
    const [wait] = session.snapshot().pendingWaits
    expect(wait).toMatchObject({ kind: 'approval' })
    expect(deployed).toEqual([])
    expect(hostCountsOf(host).children).toBe(1)
    expect(disposed).not.toHaveBeenCalled()

    const receipt = await session.resolve({
      resume: [
        { interruptId: wait?.waitId ?? '', status: 'resolved', payload: true },
      ],
    })
    expect(receipt).toMatchObject({ status: 'accepted' })
    await expect(turn).resolves.toMatchObject({ text: 'Done.' })
    expect(deployed).toEqual(['prod'])
    expect(JSON.stringify(model.calls[1]?.messages)).toContain('Deployed.')
    expect(session.snapshot().pendingWaits).toEqual([])
    // The child and its plugins closed with the run.
    expect(hostCountsOf(host).children).toBe(0)
    expect(disposed).toHaveBeenCalledTimes(1)
    await host.close()
  })

  it('lists a wait of the child on another host and in host.observe, and an answer there resumes the child', async () => {
    const deployed: Array<string> = []
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({ target: z.string() }),
    }).server(({ target }) => {
      deployed.push(target)
      return Promise.resolve({ deployed: true })
    })
    const child = defineHarness({
      name: 'test/deployer',
      adapter: mockAdapter([
        () => toolCall('deploy', { target: 'prod' }),
        () => text('Deployed.'),
      ]).adapter,
      tools: [deploy],
    })
    const { harness } = lead(child)
    // Two hosts on one log backend: two servers on one database.
    const logState = memoryLogState()
    const hostOf = () =>
      createHarnessHost({
        persistence: { stores: { log: memoryLogStore({ state: logState }) } },
      })
    const owner = hostOf()
    const other = hostOf()
    const session = await owner.open(harness, { threadId: 't' })

    const turn = session.send('Ship it.')
    await waitFor(() => expect(session.snapshot().pendingWaits).toHaveLength(1))
    const [wait] = session.snapshot().pendingWaits
    const view = await other.observe(harness, { threadId: 't' })
    await waitFor(async () =>
      expect((await view.snapshot()).pendingWaits).toEqual([
        expect.objectContaining({ waitId: wait?.waitId, kind: 'approval' }),
      ]),
    )
    const remote = await other.open(harness, { threadId: 't' })
    await waitFor(() =>
      expect(remote.snapshot().pendingWaits).toEqual([
        expect.objectContaining({ waitId: wait?.waitId, kind: 'approval' }),
      ]),
    )
    // The owner lists the wait once: from its live child, not also from the log.
    expect(session.snapshot().pendingWaits).toHaveLength(1)

    const receipt = await remote.resolve({
      resume: [
        { interruptId: wait?.waitId ?? '', status: 'resolved', payload: true },
      ],
    })

    expect(receipt.status).not.toBe('rejected')
    await expect(turn).resolves.toMatchObject({ text: 'Done.' })
    expect(deployed).toEqual(['prod'])
    await waitFor(() => expect(remote.snapshot().pendingWaits).toEqual([]))
    expect((await view.snapshot()).pendingWaits).toEqual([])
    await other.close()
    await owner.close()
  })

  it('hides the waits of a child whose host stopped, once another host owns the log', async () => {
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({}),
    }).server(() => Promise.resolve({ deployed: true }))
    /** A child that asks to deploy with the tool call `callId`. */
    const childOf = (callId: string) =>
      defineHarness({
        name: 'test/deployer',
        adapter: mockAdapter([
          () => toolCall('deploy', {}, callId),
          () => text('Deployed.'),
        ]).adapter,
        tools: [deploy],
      })
    // Two hosts on one log backend, with the clock of the store.
    let clock = Date.now()
    const logState = memoryLogState({ now: () => clock })
    const hostOf = () =>
      createHarnessHost({
        persistence: { stores: { log: memoryLogStore({ state: logState }) } },
      })
    const first = await hostOf().open(lead(childOf('call-a')).harness, {
      threadId: 't',
    })
    void Promise.resolve(first.send('Ship it.')).catch(() => {})
    await waitFor(() => expect(first.snapshot().pendingWaits).toHaveLength(1))

    // The first host stops while its child waits: it never closes, and its
    // ownership of the log expires. The next host runs the turn again, and
    // its model starts a new child that waits too.
    clock += 10 * 60_000
    const agent = harnessAgent(childOf('call-b'))
    const model = mockAdapter([
      () => toolCall(agent.name, { prompt: 'Do it again.' }, 'call-2'),
      () => text('Done.'),
    ])
    const harness = defineHarness({
      name: 'test/lead',
      adapter: model.adapter,
      subagents: { agents: [agent] },
    })
    const host = hostOf()
    const next = await host.open(harness, { threadId: 't' })
    const live = [expect.objectContaining({ waitId: 'approval_call-b' })]
    await waitFor(() => expect(next.snapshot().pendingWaits).toEqual(live))
    const view = await hostOf().observe(harness, { threadId: 't' })
    await waitFor(async () =>
      expect((await view.snapshot()).pendingWaits).toEqual(live),
    )
    await host.close()
  }, 10_000)

  it('cancels the child when the run stops while a turn of the child waits', async () => {
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({}),
    }).server(() => Promise.resolve({ deployed: true }))
    const child = defineHarness({
      name: 'test/waiting-child',
      adapter: mockAdapter([() => toolCall('deploy', {})]).adapter,
      tools: [deploy],
    })
    const { harness } = lead(child)
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't' })

    const turn = session.send('Ship it.')
    await waitFor(() => expect(session.snapshot().pendingWaits).toHaveLength(1))
    await turn.cancel()
    await expect(turn).rejects.toThrow()
    await waitFor(() => expect(hostCountsOf(host).children).toBe(0))
    // The log of the child still has its stopped turn, but its run ended.
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })

  it('goes on when the child resumes by itself, not through an answer here', async () => {
    // The child session that the run opens.
    let childSession: SessionImpl | undefined
    const open = SessionImpl.prototype.open
    vi.spyOn(SessionImpl.prototype, 'open').mockImplementation(
      function (this: SessionImpl) {
        if (this.threadId.includes('/agent/')) childSession = this
        return open.call(this)
      },
    )
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({}),
    }).server(() => Promise.resolve({ deployed: true }))
    const child = defineHarness({
      name: 'test/self-resuming',
      adapter: mockAdapter([
        () => toolCall('deploy', {}),
        () => text('Not deployed.'),
      ]).adapter,
      tools: [deploy],
    })
    const { harness } = lead(child)
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't' })

    const turn = session.send('Ship it.')
    await waitFor(() => expect(session.snapshot().pendingWaits).toHaveLength(1))
    const [wait] = session.snapshot().pendingWaits
    // As an expired wait does: the child resolves its own wait.
    await childSession?.resolve({
      resume: [{ interruptId: wait?.waitId ?? '', status: 'cancelled' }],
    })
    await expect(turn).resolves.toMatchObject({ text: 'Done.' })
    await host.close()
    vi.restoreAllMocks()
  })

  it('sends the child tool calls and its usage to the parent run, with parentRunId', async () => {
    const child = defineHarness({
      name: 'test/tool-child',
      adapter: mockAdapter([
        () => withTokens(toolCall('noop', {}, 'inner-call'), 30),
        () => withTokens(text('Checked.'), 20),
      ]).adapter,
      tools: [noop],
    })
    const { harness } = lead(child)
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't' })

    const turn = session.send('Check.')
    const chunks: Array<StreamChunk> = []
    for await (const chunk of turn.stream()) chunks.push(chunk)
    await turn

    const started = chunks.find(
      (chunk) =>
        chunk.type === EventType.TOOL_CALL_START &&
        chunk.toolCallName === 'noop',
    )
    expect(started).toMatchObject({
      metadata: { tanstack: { parentRunId: turn.id } },
    })
    // The model call of the turn that ran the child carries the child usage.
    const finished = chunks.filter(
      (chunk) => chunk.type === EventType.RUN_FINISHED,
    )
    expect(finished).toContainEqual(
      expect.objectContaining({
        usage: [expect.objectContaining({ totalTokens: 50 })],
      }),
    )
    // The input and operation events of the child session stay there.
    expect(
      chunks.filter(
        (chunk) =>
          chunk.type === EventType.CUSTOM &&
          chunk.name.startsWith('harness.operation.') &&
          'subagentRunId' in chunk,
      ),
    ).toEqual([])
    expect(session.usage().total.totalTokens).toBe(50)
    await host.close()
  })
})

describe('harnessAgent outside a harness session', () => {
  it('runs the harness on the given host, as harnessText does', async () => {
    const child = defineHarness({
      name: 'test/plain-child',
      adapter: mockAdapter([() => text('Plain answer.')]).adapter,
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const agent = harnessAgent(child, { host })
    const outer = mockAdapter([
      () => toolCall(agent.name, { prompt: 'Do it.' }),
      () => text('Done.'),
    ])

    const result = await chat({
      adapter: outer.adapter,
      messages: [{ role: 'user', content: 'Go.' }],
      threadId: 'plain',
      subagents: { agents: [agent] },
      stream: false,
    })
    expect(result.text).toMatch(/Done\.$/)
    expect(JSON.stringify(outer.calls[1]?.messages)).toContain('Plain answer.')
    // The inner session ran on `host`, on a thread of its own.
    expect((await host.sessions.list()).entries).toEqual([
      expect.objectContaining({ harness: 'test/plain-child' }),
    ])
    await host.close()
  })
})
