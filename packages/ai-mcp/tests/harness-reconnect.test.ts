import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { InMemoryTransport } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { mcp } from '../src/harness'
import { recorder } from './connector-helpers'
import type { HarnessSession } from '@tanstack/ai-harness'

// The stdio transport starts a child process. Here each start is an SDK
// server in this process, so a test can stop it and start the next one.
const stdio = vi.hoisted(() => ({
  start: (): unknown => {
    throw new Error('stdio.start is not set')
  },
}))
vi.mock('../src/stdio', () => ({ stdioTransport: () => stdio.start() }))

/** One start of the stdio server. */
interface Child {
  server: McpServer
  /** The next start fails to connect, like a child that exits at once. */
  refused: boolean
}

const children: Array<Child> = []
// How many of the next starts fail.
let refuse = 0

stdio.start = () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const server = new McpServer({ name: 'local', version: '1.0.0' })
  const number = children.length + 1
  server.registerTool(
    'pid',
    {
      description: 'Name this start of the server',
      inputSchema: z.object({ text: z.string() }),
    },
    async () => ({
      content: [{ type: 'text' as const, text: `child:${number}` }],
    }),
  )
  const refused = refuse > 0
  refuse -= 1
  children.push({ server, refused })
  if (refused) void serverSide.close()
  else void server.connect(serverSide)
  return clientSide
}

const cleanups: Array<() => unknown> = []

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  children.length = 0
  refuse = 0
})

/**
 * Opens `count` sessions of one harness with one stdio server `local`. The
 * model calls `local_pid` on the first model call of each turn.
 */
async function openSessions(count: number) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  cleanups.push(() => host.close())
  const model = recorder('local_pid', (call) => call % 2 === 1)
  // One plugin object, so the sessions share one stdio server.
  const tools = mcp({
    servers: { local: { type: 'stdio', command: 'local-server' } },
  })
  const harness = defineHarness({
    name: 'test/mcp-reconnect',
    adapter: model.adapter,
    plugins: () => [tools],
  })
  const sessions = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      host.open(harness, { threadId: `t-${index}` }),
    ),
  )
  return { host, sessions, model }
}

function statusOf(session: HarnessSession) {
  return session.runCommand({ name: 'mcp' })
}

/** The text of the last model call: it has the result of the tool call. */
function lastSeen(model: ReturnType<typeof recorder>) {
  return JSON.stringify(model.calls.at(-1)?.messages)
}

/** Stop the current start of the server, with fake timers for the backoff. */
async function stopServer() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  await children.at(-1)?.server.close()
  await vi.advanceTimersByTimeAsync(0)
}

describe('mcp reconnect', () => {
  it('connects a shared stdio server again for every session, and gives its tools at the next turn', async () => {
    const { sessions, model } = await openSessions(2)
    const [first, second] = sessions
    if (!first || !second) throw new Error('two sessions expected')
    await first.send('which server?')
    expect(lastSeen(model)).toContain('child:1')

    await stopServer()
    await expect(statusOf(first)).resolves.toBe('local: reconnecting')
    await expect(statusOf(second)).resolves.toBe('local: reconnecting')

    // The first wait is 0.5 s at most.
    await vi.advanceTimersByTimeAsync(500)
    vi.useRealTimers()
    await vi.waitFor(async () =>
      expect(await statusOf(second)).toBe('local: connected (1 tool)'),
    )
    await expect(statusOf(first)).resolves.toBe('local: connected (1 tool)')
    // One new start for both sessions.
    expect(children).toHaveLength(2)

    await second.send('which server now?')
    expect(lastSeen(model)).toContain('child:2')
    await first.send('and here?')
    expect(lastSeen(model)).toContain('child:2')
  })

  it('waits 0.5 s, 1 s, then 2 s (with jitter) between the tries', async () => {
    const { sessions } = await openSessions(1)
    const [session] = sessions
    if (!session) throw new Error('a session expected')
    await session.send('hi')

    refuse = 2
    // No jitter: each wait is half of 0.5 s, 1 s, 2 s, and so on. The
    // harness uses Math.random for its ids, so the mock ends before the
    // next session call.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    await stopServer()
    // Attempt 1 after 250 ms (refused), 2 after 500 ms more (refused), 3
    // after 1000 ms more.
    for (const [wait, starts] of [
      [249, 1],
      [1, 2],
      [499, 2],
      [1, 3],
      [999, 3],
      [1, 4],
    ] as const) {
      await vi.advanceTimersByTimeAsync(wait)
      expect(children).toHaveLength(starts)
    }
    random.mockRestore()
    vi.useRealTimers()
    await vi.waitFor(async () =>
      expect(await statusOf(session)).toBe('local: connected (1 tool)'),
    )
  })

  it('keeps the backoff when a server drops again right after it connects', async () => {
    const { sessions } = await openSessions(1)
    const [session] = sessions
    if (!session) throw new Error('a session expected')
    await session.send('hi')

    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    await stopServer()
    await vi.advanceTimersByTimeAsync(250)
    expect(children).toHaveLength(2)
    await vi.waitFor(async () =>
      expect(await statusOf(session)).toBe('local: connected (1 tool)'),
    )

    // The new start crashes at once: the next wait is 0.5 s, not 0.25 s.
    await stopServer()
    await vi.advanceTimersByTimeAsync(499)
    expect(children).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(children).toHaveLength(3)
    random.mockRestore()
  })

  it('leaves no timer when the host closes while a connect runs', async () => {
    const { host, sessions } = await openSessions(1)
    await sessions[0]?.send('hi')

    // The next start hangs until the test refuses it.
    let refuseNow = () => {}
    const hanging = new Promise<void>((_, reject) => {
      refuseNow = () => reject(new Error('refused'))
    })
    const start = stdio.start
    cleanups.push(() => {
      stdio.start = start
    })
    stdio.start = () => ({
      start: () => hanging,
      send: async () => {},
      close: async () => {},
    })
    await stopServer()
    await vi.advanceTimersByTimeAsync(500)

    const closing = host.close()
    refuseNow()
    await closing
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('connects again after a failed first connect, and gives its tools at a later turn', async () => {
    refuse = 1
    const { sessions, model } = await openSessions(1)
    const [session] = sessions
    if (!session) throw new Error('a session expected')
    expect(await statusOf(session)).toMatch(/^local: failed: /)

    // The first wait is 0.5 s at most.
    await vi.waitFor(
      async () =>
        expect(await statusOf(session)).toBe('local: connected (1 tool)'),
      { timeout: 5_000 },
    )
    expect(children).toHaveLength(2)
    await session.send('which server?')
    expect(lastSeen(model)).toContain('child:2')
  })

  it('stops trying when the host closes', async () => {
    const { host, sessions } = await openSessions(1)
    await sessions[0]?.send('hi')

    refuse = Number.POSITIVE_INFINITY
    await stopServer()
    await vi.advanceTimersByTimeAsync(500)
    expect(children).toHaveLength(2)

    await host.close()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(children).toHaveLength(2)
  })
})

describe('mcp tools/list_changed', () => {
  it('lists the tools again at the next turn, and updates the tool count', async () => {
    const { sessions, model } = await openSessions(1)
    const [session] = sessions
    if (!session) throw new Error('a session expected')
    await session.send('hi')
    expect(model.toolNames(0)).toEqual(['local_pid'])

    const server = children.at(-1)?.server
    server?.registerTool(
      'time',
      { description: 'The time', inputSchema: z.object({}) },
      async () => ({ content: [{ type: 'text' as const, text: 'noon' }] }),
    )
    await server?.sendToolListChanged()
    await session.send('and now?')

    expect(model.toolNames(2)).toEqual(['local_pid', 'local_time'])
    await expect(statusOf(session)).resolves.toBe('local: connected (2 tools)')
  })
})
