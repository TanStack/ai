import { describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHandler,
  createHarnessHost,
  createPluginEvent,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { createHarnessClient } from '../src/client'
import { createSessionView } from '../src/view'
import { after, gate, mockAdapter, text, toolCall } from './helpers'
import type { Reply } from './helpers'

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
    const steer = vi.spyOn(session, 'steer')

    await view.send('faster')
    hold.open()

    expect(steer).toHaveBeenCalledWith('faster')
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
    expect(resolve.mock.calls[0]?.[0]).toEqual([
      { interruptId: first?.id, status: 'resolved', payload: true },
      { interruptId: second?.id, status: 'resolved', payload: false },
    ])
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
    const receipt = await session.resolve([
      { interruptId: 'wrong', status: 'resolved', payload: true },
    ])
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
    expect(session.snapshot().pendingInterrupts).toEqual([])
    expect(view.store.get().approvals).toEqual([])
    view.approveAll()
    expect(resolve).toHaveBeenCalledTimes(1)
    hold.open()
    await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0))
    // The approved tool ran before the failure, so the approval is used up.
    // Offering it again would run the tool a second time.
    expect(session.snapshot().pendingInterrupts).toEqual([])
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

    await view.command('nope')

    await vi.waitFor(() =>
      expect(errors).toEqual(['Not accepted: unknown_command']),
    )
    view.dispose()
    await host.close()
  })

  it('shows history after a restart, then the notices added before ready', async () => {
    const persistence = memoryPersistence()
    const first = await open([() => text('Saved answer.')], persistence)
    await first.session.prompt('remember this')
    await first.host.close()

    const second = await open([], persistence)
    const view = createSessionView(second.session)
    view.notice('Welcome back.')
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
    await session.command('ping')
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(view.store.get()).toEqual({ ...before, connection: 'closed' })
    expect(snapshot).not.toHaveBeenCalled()
    await expect(view.send('hi')).rejects.toThrow('disposed')
    expect(() => view.approve('x')).toThrow('disposed')
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
      authorize: () => ({ id: 'u' }),
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
})
