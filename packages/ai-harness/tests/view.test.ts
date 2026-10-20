import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  createPluginEvent,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { createHarnessHandler } from '../src/server'
import { createHarnessClient } from '../src/client'
import { createSessionView } from '../src/view'
import {
  after,
  gate,
  mockAdapter,
  text,
  toolCall,
  turnInterrupts,
} from './helpers'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const Pinged = createPluginEvent<{ count: number }>('test/pinged')

const pinger = definePlugin({
  name: 'test/pinger',
  setup: (ctx) => {
    const state = ctx.state({ pings: 0 })
    return {
      commands: {
        ping: defineCommand({
          description: 'Ping',
          run: async () => {
            const next = await state.update((saved) => ({
              pings: saved.pings + 1,
            }))
            ctx.emit(Pinged, { count: next.pings })
            return 'pong'
          },
        }),
      },
    }
  },
})

const remove = toolDefinition({
  name: 'remove',
  description: 'Remove',
  needsApproval: true,
}).server(async () => 'removed')
const archive = toolDefinition({
  name: 'archive',
  description: 'Archive',
  needsApproval: true,
}).server(async () => 'archived')

async function open(replies: Array<Reply>, persistence = memoryPersistence()) {
  const main = mockAdapter(replies)
  const harness = defineHarness({
    name: 'test/view',
    adapter: main.adapter,
    tools: [remove, archive],
    plugins: () => [pinger],
  })
  const host = createHarnessHost({ persistence })
  const session = await host.open(harness, { threadId: 't' })
  return { host, session, harness, persistence, calls: main.calls }
}

/** A session with a view on it that has read the session once. */
async function openView(replies: Array<Reply>) {
  const opened = await open(replies)
  const view = createSessionView(opened.session)
  await view.ready
  return { ...opened, view }
}

describe('createSessionView', () => {
  it('streams a prompt into messages and ends the turn', async () => {
    const { host, view } = await openView([() => text('Hello there.')])
    const turnEnds: Array<string> = []
    view.on('turnEnd', (value) => turnEnds.push(value.operationId))

    await view.send('hi')

    await vi.waitFor(() => expect(turnEnds).toHaveLength(1))
    const { messages, status } = view.store.get()
    expect(messages[0]).toMatchObject({ role: 'user', text: 'hi' })
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello there.' }],
    })
    expect(status).toBe('idle')
    view.dispose()
    await host.close()
  })

  it('ignores an empty line', async () => {
    const { host, view, calls } = await openView([])

    await view.send('   ')

    expect(view.store.get().messages).toEqual([])
    expect(calls).toHaveLength(0)
    view.dispose()
    await host.close()
  })

  it('steers a running turn instead of starting a new one', async () => {
    const hold = gate()
    const { host, session, view, calls } = await openView([
      after(hold.opened, 'first'),
    ])
    await view.send('start')
    await vi.waitFor(() => expect(view.store.get().status).toBe('running'))
    const steer = vi.spyOn(session, 'send')

    await view.send('faster')
    hold.open()

    expect(steer).toHaveBeenCalledWith('faster', { mode: 'steer' })
    await vi.waitFor(() => expect(view.store.get().status).toBe('idle'))
    expect(calls.length).toBeGreaterThanOrEqual(1)
    view.dispose()
    await host.close()
  })

  it('sends one resolve for two approvals, and ignores a second click', async () => {
    const { host, session, view } = await openView([
      () => [
        ...toolCall('remove', {}, 'c1').slice(0, -1),
        ...toolCall('archive', {}, 'c2').slice(1),
      ],
      () => text('Both done.'),
    ])
    const asked: Array<string> = []
    view.on('approval', (approval) => asked.push(approval.tool))
    const resolve = vi.spyOn(session, 'resolve')

    await view.send('clean up')
    await vi.waitFor(() => expect(view.store.get().approvals).toHaveLength(2))
    expect(asked.sort()).toEqual(['archive', 'remove'])
    const [first, second] = view.store.get().approvals
    first?.approve()
    first?.approve()
    expect(resolve).not.toHaveBeenCalled()
    second?.reject()

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve.mock.calls[0]?.[0]).toEqual({
      resume: [
        { interruptId: first?.id, status: 'resolved', payload: true },
        { interruptId: second?.id, status: 'resolved', payload: false },
      ],
    })
    await vi.waitFor(() => expect(view.store.get().status).toBe('idle'))
    view.dispose()
    await host.close()
  })

  it('keeps a rejected approval visible and lets the view retry it', async () => {
    const { host, session, view } = await openView([
      () => toolCall('remove', {}, 'view-retry'),
      () => text('Removed after retry.'),
    ])
    await view.send('remove')
    await vi.waitFor(() => expect(view.store.get().approvals).toHaveLength(1))
    const id = view.store.get().approvals[0]?.id
    const receipt = await session.resolve({
      resume: [{ interruptId: 'wrong', status: 'resolved', payload: true }],
    })
    await expect(session.operation(receipt.operationId ?? '')).rejects.toThrow()
    await vi.waitFor(() =>
      expect(view.store.get().approvals.map((item) => item.id)).toEqual([id]),
    )
    view.approveAll()
    await vi.waitFor(() => expect(view.store.get().approvals).toEqual([]))
    await vi.waitFor(() =>
      expect(JSON.stringify(view.store.get().messages)).toContain(
        'Removed after retry.',
      ),
    )
    view.dispose()
    await host.close()
  })

  it('reserves approval actions during a running resolve, and does not restore them after the tool ran', async () => {
    const hold = gate()
    const { host, session, view, calls } = await openView([
      () => toolCall('remove', {}, 'slow-approval'),
      () =>
        (async function* () {
          await hold.opened
          throw new Error('provider failed before commit')
        })(),
    ])
    const errors: Array<string> = []
    view.on('error', (message) => errors.push(message))
    await view.send('remove')
    await vi.waitFor(() => expect(view.store.get().approvals).toHaveLength(1))
    const resolve = vi.spyOn(session, 'resolve')
    view.approveAll()
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(turnInterrupts(session.snapshot())).toEqual([])
    expect(view.store.get().approvals).toEqual([])
    view.approveAll()
    expect(resolve).toHaveBeenCalledTimes(1)
    hold.open()
    await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0))
    // The approved tool ran before the failure, so the approval is used up.
    // Offering it again would run the tool a second time.
    expect(turnInterrupts(session.snapshot())).toEqual([])
    expect(view.store.get().approvals).toEqual([])
    view.approveAll()
    expect(resolve).toHaveBeenCalledTimes(1)
    view.dispose()
    await host.close()
  })

  it('runs commands, shows their text, and follows plugin state and events', async () => {
    const { host, view } = await openView([])
    const pinged: Array<number> = []
    view.on(Pinged, (value) => pinged.push(value.count))
    expect(view.store.get().plugins).toEqual({ 'test/pinger': { pings: 0 } })
    expect(view.store.get().commands.map((command) => command.name)).toEqual([
      'ping',
    ])

    await view.send('/ping')

    await vi.waitFor(() => expect(pinged).toEqual([1]))
    expect(view.store.get().plugins).toEqual({ 'test/pinger': { pings: 1 } })
    expect(view.store.get().messages).toContainEqual(
      expect.objectContaining({
        role: 'notice',
        kind: 'command',
        text: 'pong',
      }),
    )
    view.dispose()
    await host.close()
  })

  it('shows a rejected command as a notice and an error event', async () => {
    const { host, view } = await openView([])
    const errors: Array<string> = []
    view.on('error', (message) => errors.push(message))

    await view.runCommand({ name: 'nope' })

    await vi.waitFor(() =>
      expect(errors).toEqual(['Not accepted: unknown_command']),
    )
    view.dispose()
    await host.close()
  })

  it('shows history after a restart, then the notices added before ready', async () => {
    const persistence = memoryPersistence()
    const first = await open([() => text('Saved answer.')], persistence)
    await first.session.send('remember this')
    await first.host.close()

    const second = await open([], persistence)
    const view = createSessionView(second.session)
    view.notice({ text: 'Welcome back.' })
    await view.ready

    expect(view.store.get().messages).toEqual([
      expect.objectContaining({ role: 'user', text: 'remember this' }),
      expect.objectContaining({
        role: 'assistant',
        parts: [{ type: 'text', text: 'Saved answer.' }],
      }),
      expect.objectContaining({
        role: 'notice',
        kind: 'ui',
        text: 'Welcome back.',
      }),
    ])
    view.dispose()
    await second.host.close()
  })

  it('stops after dispose', async () => {
    const { host, session } = await open([])
    // The host also reads `session.snapshot()` for its status feed. Count
    // only the reads of the view.
    const snapshot = vi.fn(() => session.snapshot())
    const view = createSessionView(
      new Proxy(session, {
        get: (target, key) =>
          key === 'snapshot' ? snapshot : Reflect.get(target, key),
      }),
    )
    await view.ready
    const before = view.store.get()
    snapshot.mockClear()

    view.dispose()
    await session.runCommand({ name: 'ping' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(view.store.get()).toEqual({ ...before, connection: 'closed' })
    expect(snapshot).not.toHaveBeenCalled()
    await expect(view.send('hi')).rejects.toThrow('disposed')
    expect(() => view.approve({ id: 'x' })).toThrow('disposed')
    await host.close()
  })

  it('works the same through createHarnessHandler and createHarnessClient', async () => {
    const { host, harness } = await open([
      () => toolCall('remove', {}, 'c1'),
      () => text('Removed it.'),
    ])
    const handler = createHarnessHandler({
      host,
      harness,
      openAccess: { user: { id: 'u' } },
    })
    const client = createHarnessClient({
      url: 'http://local/api/harness',
      threadId: 't',
      fetch: (input, init) => handler(new Request(input, init)),
    })
    const view = createSessionView(client)
    await view.ready

    await view.send('remove the file')
    await vi.waitFor(() => expect(view.store.get().approvals).toHaveLength(1))
    view.approveAll()

    await vi.waitFor(() =>
      expect(JSON.stringify(view.store.get().messages)).toContain(
        'Removed it.',
      ),
    )
    expect(view.store.get().connection).toBe('open')
    view.dispose()
    await host.close()
  })

  it('shows a command or setting that a client may not use, once each', async () => {
    const harness = defineHarness({
      name: 'test/view-refused',
      adapter: mockAdapter([]).adapter,
      plugins: () => [pinger],
      // No plugin has `missing`, so the session refuses it with an event.
      expose: { config: ['missing'] },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const handler = createHarnessHandler({
      host,
      harness,
      openAccess: { user: { id: 'u' } },
    })
    const view = createSessionView(
      createHarnessClient({
        url: 'http://local/api/harness',
        threadId: 't',
        fetch: (input, init) => handler(new Request(input, init)),
      }),
    )
    await view.ready
    const errors: Array<string> = []
    view.on('error', (message) => errors.push(message))

    await view.setPluginSetting({ key: 'missing', value: 1 })
    await vi.waitFor(() =>
      expect(errors).toEqual(['Not accepted: unknown_config']),
    )
    await view.setPluginSetting({ key: 'mode', value: 'bypass' })
    await view.runCommand({ name: 'ping' })
    await view.send('/ping')

    const refused = 'Not accepted: not_exposed'
    await vi.waitFor(() => expect(errors).toHaveLength(4))
    expect(errors).toEqual([
      'Not accepted: unknown_config',
      refused,
      refused,
      refused,
    ])
    const notices = view.store
      .get()
      .messages.flatMap((message) =>
        message.role === 'notice' ? [[message.kind, message.text]] : [],
      )
    expect(notices).toEqual([
      ['rejected', 'Not accepted: unknown_config'],
      ['rejected', refused],
      ['rejected', refused],
      ['rejected', refused],
    ])
    view.dispose()
    await host.close()
  })
})

describe('the agents of a session view', () => {
  /** A session with one `writer` run that waits for `hold`. */
  async function openWriter() {
    const hold = gate()
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes when the test lets it',
      run: async () => {
        await hold.opened
        return 'Draft.'
      },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/view-agents',
        adapter: mockAdapter([]).adapter,
        agents: [writer],
      }),
      {
        threadId: 't',
      },
    )
    const run = session.agents.writer.start()
    return { hold, host, session, run }
  }

  it('sends a message to a running agent', async () => {
    const { hold, host, session, run } = await openWriter()
    const view = createSessionView(session)
    await view.ready

    const [agent] = view.store.get().agents
    const receipt = await agent?.send('Add a title.', { mode: 'followUp' })

    expect(agent).toMatchObject({ id: run.id, name: 'writer' })
    expect(receipt).toMatchObject({ status: 'queued' })
    expect(session.agentRuns().map((item) => item.status)).toEqual([
      'running',
      'queued',
    ])
    hold.open()
    await run
    view.dispose()
    await host.close()
  })

  it('shows the wait of a background run, and answers it on its own', async () => {
    const removed: Array<string> = []
    const prune = toolDefinition({
      name: 'prune',
      description: 'Prune a file. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(({ path }) => {
      removed.push(path)
      return Promise.resolve({ removed: true })
    })
    const model = mockAdapter([
      () => toolCall('prune', { path: 'old.log' }),
      () => text('Done.'),
    ])
    const cleaner = defineAgent({
      name: 'cleaner',
      description: 'Cleans up',
      run: (ctx) => ctx.chat({ adapter: model.adapter, tools: [prune] }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/view-run-waits',
        adapter: mockAdapter([]).adapter,
        agents: [cleaner],
      }),
      { threadId: 't' },
    )
    const view = createSessionView(session)
    await view.ready
    const run = session.agents.cleaner.start()
    const wait = await session.waitForRun({
      runId: run.id,
      signal: AbortSignal.timeout(5_000),
    })

    await waitFor(() =>
      expect(view.store.get().approvals.map(({ id }) => id)).toEqual([
        wait.waitId,
      ]),
    )
    expect(view.store.get().waits).toEqual([wait])
    expect(view.store.get().agents).toMatchObject([
      { id: run.id, status: 'waiting' },
    ])
    view.approve({ id: wait.waitId })
    await expect(run).resolves.toBe('Done.')
    expect(removed).toEqual(['old.log'])
    await waitFor(() => expect(view.store.get().waits).toEqual([]))
    expect(view.store.get().approvals).toEqual([])
    view.dispose()
    await host.close()
  })

  it('shows what a child agent wrote after a reload', async () => {
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: (ctx) =>
        ctx.chat({ adapter: mockAdapter(() => text('Note 1')).adapter }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/view-children',
        adapter: mockAdapter([
          () => toolCall('writer', { prompt: 'Take notes' }, 'call-1'),
          () => text('Done.'),
        ]).adapter,
        subagents: { agents: [writer] },
      }),
      {
        threadId: 't',
      },
    )
    await session.send('Notes, please')

    const view = createSessionView(session)
    await view.ready
    const message = view.store.get().messages[1]
    const card = message?.role === 'assistant' ? message.parts[1] : undefined
    // Until it loads, the child shows only its card.
    expect(card).toMatchObject({ type: 'agent', status: 'done', parts: [] })

    await view.loadAgent({ id: card?.type === 'agent' ? card.id : '' })

    expect(view.store.get().messages[1]).toMatchObject({
      role: 'assistant',
      parts: [
        { type: 'tool-call', id: 'call-1', status: 'done' },
        {
          type: 'agent',
          name: 'writer',
          status: 'done',
          parts: [{ type: 'text', text: 'Note 1' }],
        },
      ],
    })
    view.dispose()
    await host.close()
  })
})
