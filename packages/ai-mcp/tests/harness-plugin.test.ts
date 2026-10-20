import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { McpServer, inputRequired } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { mcp } from '../src/harness'
import { createMCPServer } from '../src/server/index'
import {
  approveSignIns,
  elicitServer,
  legacyElicitServer,
  recorder,
  roundsServer,
  tripForm,
} from './connector-helpers'
import { startProtectedServer } from './protected-server'
import type { McpServerConfig } from '../src/harness'

// With this env var, this file is the stdio server of the stdio test.
const childEnv = 'TANSTACK_AI_MCP_PLUGIN_CHILD'

const cleanups: Array<() => unknown> = []

/** A server with one `echo` tool, in this process. */
function echoServer(description = 'Echo text') {
  const echo = toolDefinition({
    name: 'echo',
    description,
    inputSchema: z.object({ text: z.string() }),
  }).server(async ({ text }) => text)
  return createMCPServer({ name: 'echo', version: '1.0.0', tools: [echo] })
}

/** An `http` server config whose requests go to `handle`, with no network. */
function httpServer(
  handle: (request: Request) => Promise<Response>,
  options: Pick<
    McpServerConfig,
    'timeoutMs' | 'codeMode' | 'needsApproval' | 'toolName'
  > = {},
) {
  const config: McpServerConfig = {
    type: 'http',
    url: 'http://mcp.test/mcp',
    fetch: async (input, init) => handle(new Request(input, init)),
    ...options,
  }
  return config
}

/** Opens a session with `mcp({ servers })` and the recording `model`. */
async function openWith(
  servers: Record<string, McpServerConfig>,
  model = recorder(),
) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  cleanups.push(() => host.close())
  const harness = defineHarness({
    name: 'test/mcp-plugin',
    adapter: model.adapter,
    plugins: () => [mcp({ servers })],
  })
  const session = await host.open(harness, {
    threadId: 't',
    user: { id: 'user-1' },
  })
  return { host, session, model }
}

/** A stdio server config that runs this file as an SDK server. */
function stdioServer(): McpServerConfig {
  return {
    type: 'stdio',
    command: process.execPath,
    args: ['--import', 'jiti/register', fileURLToPath(import.meta.url)],
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { [childEnv]: '1' },
  }
}

/** The pid that the `pid` tool gave in model call `call` of `model`. */
function pidOf(model: ReturnType<typeof recorder> | undefined, call: number) {
  const seen = JSON.stringify(model?.calls[call]?.messages)
  return Number(/pid:(\d+)/.exec(seen)?.[1])
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

if (process.env[childEnv] === '1') {
  // An SDK server, like most published stdio servers.
  const server = new McpServer({ name: 'local', version: '1.0.0' })
  server.registerTool(
    'pid',
    {
      description: 'Name the process of this server',
      inputSchema: z.object({ text: z.string() }),
    },
    async () => ({
      content: [{ type: 'text' as const, text: `pid:${process.pid}` }],
    }),
  )
  await server.connect(new StdioServerTransport())
} else {
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  })

  describe('mcp', () => {
    it('connects each server on its own, so a failed server leaves the tools of the others', async () => {
      const good = echoServer()
      const { session, model } = await openWith({
        good: httpServer((request) => good.fetch(request)),
        bad: httpServer(async () => {
          throw new TypeError('connection refused')
        }),
      })
      await session.send('hi')

      expect(model.toolNames(0)).toEqual(['good_echo'])
      const error =
        'Failed to connect to MCP server: Version negotiation probe failed: connection refused'
      await expect(session.runCommand({ name: 'mcp' })).resolves.toBe(
        `good: connected (1 tool)\nbad: failed: ${error}`,
      )
      expect(session.snapshot().plugins['tanstack/mcp']).toEqual({
        servers: [
          { name: 'good', status: 'connected', toolCount: 1 },
          { name: 'bad', status: 'failed', error, toolCount: 0 },
        ],
      })
    })

    it('stops a server that does not answer within its timeoutMs', async () => {
      const slow = echoServer()
      const { session, model } = await openWith({
        slow: httpServer(
          async (request) => {
            const body =
              request.method === 'POST' ? await request.clone().text() : ''
            // The tool list never comes, so only the timeout ends the wait.
            if (body.includes('"tools/list"')) {
              return new Promise<Response>(() => {})
            }
            return slow.fetch(request)
          },
          { timeoutMs: 100 },
        ),
      })
      await session.send('hi')

      expect(model.toolNames(0)).toEqual([])
      await expect(session.runCommand({ name: 'mcp' })).resolves.toMatch(
        /^slow: failed: .*timed out/i,
      )
    })

    it('stops a server that does not connect within its timeoutMs, and closes its request', async () => {
      const good = echoServer()
      const signals: Array<AbortSignal> = []
      const { session, model } = await openWith({
        good: httpServer((request) => good.fetch(request)),
        silent: {
          type: 'http',
          url: 'http://mcp.test/mcp',
          timeoutMs: 100,
          // The handshake never gets an answer, so only the timeout ends the
          // wait. The signal shows if the request was closed.
          fetch: (_input, init) => {
            if (init?.signal) signals.push(init.signal)
            return new Promise<Response>(() => {})
          },
        },
      })
      await session.send('hi')

      expect(model.toolNames(0)).toEqual(['good_echo'])
      await expect(session.runCommand({ name: 'mcp' })).resolves.toBe(
        'good: connected (1 tool)\nsilent: failed: Failed to connect to MCP server: Version negotiation probe timed out after 100ms',
      )
      expect(signals.length).toBeGreaterThan(0)
      expect(signals.every((signal) => signal.aborted)).toBe(true)
    })

    it('marks the tools of a codeMode server for code mode', async () => {
      const plain = echoServer()
      const coded = echoServer()
      const { session, model } = await openWith({
        plain: httpServer((request) => plain.fetch(request)),
        coded: httpServer((request) => coded.fetch(request), {
          codeMode: true,
        }),
      })
      await session.send('hi')

      const marks = (model.calls[0]?.tools ?? []).map((tool) => [
        tool.name,
        tool.metadata?.codeMode,
      ])
      expect(marks).toEqual([
        ['plain_echo', undefined],
        ['coded_echo', true],
      ])
    })

    it.each([
      ['true', true],
      ['a function', (tool: { name: string }) => tool.name === 'echo'],
    ])(
      'asks for approval before the tools of a server with needsApproval %s',
      async (_name, needsApproval) => {
        const gated = echoServer()
        const open = echoServer()
        const { session, model } = await openWith({
          gated: httpServer((request) => gated.fetch(request), {
            needsApproval,
          }),
          open: httpServer((request) => open.fetch(request)),
        })
        await session.send('hi')

        const marks = (model.calls[0]?.tools ?? []).map((tool) => [
          tool.name,
          tool.needsApproval === true,
        ])
        expect(marks).toEqual([
          ['gated_echo', true],
          ['open_echo', false],
        ])
      },
    )

    it('names the tools of a server with its toolName', async () => {
      const files = echoServer()
      const { session, model } = await openWith({
        files: httpServer((request) => files.fetch(request), {
          toolName: (tool) => `fs_${tool.name}`,
        }),
      })
      await session.send('hi')

      expect(model.toolNames(0)).toEqual(['fs_echo'])
    })

    it('keeps the tool of the first server when two servers give one tool name, and warns once', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      cleanups.push(() => warn.mockRestore())
      const first = echoServer('First echo')
      const second = echoServer('Second echo')
      const { session, model } = await openWith({
        first: httpServer((request) => first.fetch(request), {
          toolName: (tool) => tool.name,
        }),
        second: httpServer((request) => second.fetch(request), {
          toolName: (tool) => tool.name,
        }),
      })
      await session.send('hi')
      await session.send('again')

      for (const call of [0, 1]) {
        const tools = (model.calls[call]?.tools ?? []).map((tool) => [
          tool.name,
          tool.description,
        ])
        expect(tools).toEqual([['echo', 'First echo']])
      }
      expect(warn.mock.calls).toEqual([
        [
          '[@tanstack/ai-mcp] The MCP servers "first" and "second" both give the tool "echo". The model gets the tool of "first". Set toolName on one of the servers to rename its tools.',
        ],
      ])
    })

    it("fails the later server when two servers give one tool name, with onDuplicateTool 'error'", async () => {
      const first = echoServer('First echo')
      const second = echoServer('Second echo')
      const third = echoServer('Third echo')
      const model = recorder()
      const host = createHarnessHost({ persistence: memoryPersistence() })
      cleanups.push(() => host.close())
      const harness = defineHarness({
        name: 'test/mcp-plugin',
        adapter: model.adapter,
        plugins: () => [
          mcp({
            onDuplicateTool: 'error',
            servers: {
              first: httpServer((request) => first.fetch(request), {
                toolName: (tool) => tool.name,
              }),
              second: httpServer((request) => second.fetch(request)),
              third: httpServer((request) => third.fetch(request), {
                toolName: (tool) => tool.name,
              }),
            },
          }),
        ],
      })
      const session = await host.open(harness, { threadId: 't' })
      await session.send('hi')

      const tools = (model.calls[0]?.tools ?? []).map((tool) => [
        tool.name,
        tool.description,
      ])
      expect(tools).toEqual([
        ['echo', 'First echo'],
        ['second_echo', 'Second echo'],
      ])
      await expect(session.runCommand({ name: 'mcp' })).resolves.toBe(
        [
          'first: connected (1 tool)',
          'second: connected (1 tool)',
          'third: failed: The MCP servers "first" and "third" both give the tool "echo". Set toolName on one of the servers to rename its tools.',
        ].join('\n'),
      )
    })

    it.each([
      [
        'accepts',
        { city: 'Paris' },
        { action: 'accept', content: { city: 'Paris' } },
      ],
      ['declines', { action: 'decline' }, { action: 'decline' }],
      ['cancels', { action: 'cancel' }, { action: 'cancel' }],
    ])(
      'asks a form elicitation as a session question, and the user %s',
      async (_name, value, expected) => {
        const trips = elicitServer(inputRequired.elicit(tripForm))
        const model = recorder('trips_book')
        const { session } = await openWith(
          { trips: httpServer((request) => trips.fetch(request)) },
          model,
        )
        const turn = session.send('book a trip')
        await vi.waitFor(() =>
          expect(session.snapshot().pendingWaits).toHaveLength(1),
        )
        const [question] = session.snapshot().pendingWaits

        expect(question?.message).toBe('Which city?')
        expect(question?.schema).toMatchObject(tripForm.requestedSchema)
        expect(question?.url).toBeUndefined()
        await session.answer({ questionId: question?.waitId ?? '', value })
        await turn
        expect(trips.answers).toEqual([expected])
        expect(JSON.stringify(model.calls[1]?.messages)).toContain('booked')
      },
    )

    it('asks a url elicitation as a session question with the url', async () => {
      const trips = elicitServer(
        inputRequired.elicitUrl({
          message: 'Pay for the trip, then come back.',
          url: 'https://pay.example.com/trip',
        }),
      )
      const { session } = await openWith(
        { trips: httpServer((request) => trips.fetch(request)) },
        recorder('trips_book'),
      )
      const turn = session.send('book a trip')
      await vi.waitFor(() =>
        expect(session.snapshot().pendingWaits).toHaveLength(1),
      )
      const [question] = session.snapshot().pendingWaits

      expect(question).toMatchObject({
        message: 'Pay for the trip, then come back.',
        url: 'https://pay.example.com/trip',
      })
      await session.answer({
        questionId: question?.waitId ?? '',
        value: 'done',
      })
      await turn
      expect(trips.answers).toEqual([{ action: 'accept' }])
    })

    it.each([
      [
        'accepts',
        { city: 'Paris' },
        { action: 'accept', content: { city: 'Paris' } },
      ],
      ['declines', { action: 'decline' }, { action: 'decline' }],
      ['cancels', { action: 'cancel' }, { action: 'cancel' }],
    ])(
      'asks an elicitation/create form request of a spec 2025 server, and the user %s',
      async (_name, value, expected) => {
        const trips = await legacyElicitServer([{ mode: 'form', ...tripForm }])
        const model = recorder('trips_book')
        const { session } = await openWith(
          { trips: httpServer((request) => trips.fetch(request)) },
          model,
        )
        const turn = session.send('book a trip')
        await vi.waitFor(() =>
          expect(session.snapshot().pendingWaits).toHaveLength(1),
        )
        const [question] = session.snapshot().pendingWaits

        expect(question?.message).toBe('Which city?')
        expect(question?.schema).toMatchObject(tripForm.requestedSchema)
        await session.answer({ questionId: question?.waitId ?? '', value })
        await turn
        expect(trips.answers).toEqual([expected])
        expect(JSON.stringify(model.calls[1]?.messages)).toContain('booked')
      },
    )

    it('asks an elicitation/create url request of a spec 2025 server', async () => {
      const trips = await legacyElicitServer([
        {
          mode: 'url',
          message: 'Pay for the trip, then come back.',
          url: 'https://pay.example.com/trip',
          elicitationId: 'pay-1',
        },
      ])
      const { session } = await openWith(
        { trips: httpServer((request) => trips.fetch(request)) },
        recorder('trips_book'),
      )
      const turn = session.send('book a trip')
      await vi.waitFor(() =>
        expect(session.snapshot().pendingWaits).toHaveLength(1),
      )
      const [question] = session.snapshot().pendingWaits

      expect(question).toMatchObject({
        message: 'Pay for the trip, then come back.',
        url: 'https://pay.example.com/trip',
      })
      await session.answer({
        questionId: question?.waitId ?? '',
        value: 'done',
      })
      await turn
      expect(trips.answers).toEqual([{ action: 'accept' }])
    })

    it('asks two elicitations of one spec 2026 tool call in turn', async () => {
      const seat = {
        message: 'Which seat?',
        requestedSchema: {
          type: 'object' as const,
          properties: { seat: { type: 'string' as const } },
          required: ['seat'],
        },
      }
      const trips = roundsServer([
        inputRequired.elicit(tripForm),
        inputRequired.elicit(seat),
      ])
      const model = recorder('trips_book')
      const { session } = await openWith(
        { trips: httpServer((request) => trips.fetch(request)) },
        model,
      )
      const turn = session.send('book a trip')
      for (const [message, value] of [
        ['Which city?', { city: 'Paris' }],
        ['Which seat?', { seat: '12A' }],
      ] as const) {
        await vi.waitFor(() =>
          expect(session.snapshot().pendingWaits[0]?.message).toBe(message),
        )
        const [question] = session.snapshot().pendingWaits
        await session.answer({ questionId: question?.waitId ?? '', value })
      }
      await turn
      expect(trips.answers).toEqual([
        { action: 'accept', content: { city: 'Paris' } },
        { action: 'accept', content: { seat: '12A' } },
      ])
      expect(JSON.stringify(model.calls[1]?.messages)).toContain('booked')
    })

    it('fails the tool call after 5 elicitations in one call', async () => {
      const trips = roundsServer(
        Array.from({ length: 6 }, () => inputRequired.elicit(tripForm)),
      )
      const model = recorder('trips_book')
      const { session } = await openWith(
        { trips: httpServer((request) => trips.fetch(request)) },
        model,
      )
      const turn = session.send('book a trip')
      for (let round = 0; round < 5; round++) {
        await vi.waitFor(() =>
          expect(session.snapshot().pendingWaits).toHaveLength(1),
        )
        const [question] = session.snapshot().pendingWaits
        await session.answer({
          questionId: question?.waitId ?? '',
          value: { city: 'Paris' },
        })
      }
      await turn
      expect(trips.answers).toHaveLength(5)
      expect(JSON.stringify(model.calls[1]?.messages)).toContain(
        'asked for input more than 5 times',
      )
    })

    it('runs a stdio server as a child process and stops it when the host closes', async () => {
      const model = recorder('local_pid')
      const { host, session } = await openWith({ local: stdioServer() }, model)
      await session.send('which process runs the server?')
      const pid = pidOf(model, 1)
      expect(isRunning(pid)).toBe(true)

      await host.close()
      await vi.waitFor(() => expect(isRunning(pid)).toBe(false), {
        timeout: 10_000,
      })
    }, 120_000)

    it('runs one stdio child for two sessions, and stops it when the last one closes', async () => {
      const host = createHarnessHost({
        persistence: memoryPersistence(),
        lifecycle: { closeIdleSessionsAfterMs: 0 },
      })
      cleanups.push(() => host.close())
      // One plugin object, so one shared setup. The model calls the tool on
      // the first call of each turn: calls 1 and 3.
      const model = recorder('local_pid', (call) => call % 2 === 1)
      const tools = mcp({ servers: { local: stdioServer() } })
      const harness = defineHarness({
        name: 'test/mcp-plugin',
        adapter: model.adapter,
        plugins: () => [tools],
      })
      const [first, second] = await Promise.all([
        host.open(harness, { threadId: 't-0' }),
        host.open(harness, { threadId: 't-1' }),
      ])

      await first.send('which process runs the server?')
      await second.send('which process runs the server?')
      const pid = pidOf(model, 1)
      expect(pid).toBeGreaterThan(0)
      expect(pidOf(model, 3)).toBe(pid)

      await first.close()
      expect(isRunning(pid)).toBe(true)
      await second.close()
      await vi.waitFor(() => expect(isRunning(pid)).toBe(false), {
        timeout: 10_000,
      })
    }, 120_000)

    it('signs in to an oauth server with /connect, then gives its tools', async () => {
      const protectedServer = await startProtectedServer()
      cleanups.push(() => protectedServer.close())
      const { session, model } = await openWith({
        demo: { type: 'http', url: protectedServer.url, oauth: true },
      })
      await session.send('before')
      await expect(session.runCommand({ name: 'mcp' })).resolves.toBe(
        'demo: failed: Not signed in. Run /connect demo.',
      )

      const browser = approveSignIns(session, 'code-1')
      cleanups.push(browser.stop)
      await expect(session.runCommand({ name: 'connect:demo' })).resolves.toBe(
        'Connected to demo.',
      )
      await session.send('after')

      expect(model.toolNames(0)).toEqual([])
      expect(model.toolNames(1)).toEqual(['demo_echo'])
      await expect(session.runCommand({ name: 'mcp' })).resolves.toBe(
        'demo: connected (1 tool)',
      )
    })
  })
}
