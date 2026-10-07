import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { mcp } from '../src/harness'
import { createMCPServer } from '../src/server/index'
import { approveSignIns, recorder } from './connector-helpers'
import { startProtectedServer } from './protected-server'
import type { McpServerConfig } from '../src/harness'

// With this env var, this file is the stdio server of the stdio test.
const childEnv = 'TANSTACK_AI_MCP_PLUGIN_CHILD'

const cleanups: Array<() => unknown> = []

/** A server with one `echo` tool, in this process. */
function echoServer() {
  const echo = toolDefinition({
    name: 'echo',
    description: 'Echo text',
    inputSchema: z.object({ text: z.string() }),
  }).server(async ({ text }) => text)
  return createMCPServer({ name: 'echo', version: '1.0.0', tools: [echo] })
}

/** An `http` server config whose requests go to `handle`, with no network. */
function httpServer(
  handle: (request: Request) => Promise<Response>,
  options: Pick<McpServerConfig, 'timeoutMs' | 'codeMode'> = {},
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
    principal: { id: 'user-1' },
  })
  return { host, session, model }
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
      await session.prompt('hi')

      expect(model.toolNames(0)).toEqual(['good_echo'])
      const error =
        'Failed to connect to MCP server: Version negotiation probe failed: connection refused'
      await expect(session.command('mcp')).resolves.toBe(
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
      await session.prompt('hi')

      expect(model.toolNames(0)).toEqual([])
      await expect(session.command('mcp')).resolves.toMatch(
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
      await session.prompt('hi')

      expect(model.toolNames(0)).toEqual(['good_echo'])
      await expect(session.command('mcp')).resolves.toBe(
        'good: connected (1 tool)\nsilent: failed: MCP server "silent" did not connect within 100 ms.',
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
      await session.prompt('hi')

      const marks = (model.calls[0]?.tools ?? []).map((tool) => [
        tool.name,
        tool.metadata?.codeMode,
      ])
      expect(marks).toEqual([
        ['plain_echo', undefined],
        ['coded_echo', true],
      ])
    })

    it('runs a stdio server as a child process and stops it when the session closes', async () => {
      const model = recorder('local_pid')
      const { host, session } = await openWith(
        {
          local: {
            type: 'stdio',
            command: process.execPath,
            args: ['--import', 'jiti/register', fileURLToPath(import.meta.url)],
            cwd: fileURLToPath(new URL('..', import.meta.url)),
            env: { [childEnv]: '1' },
          },
        },
        model,
      )
      await session.prompt('which process runs the server?')
      const seen = JSON.stringify(model.calls[1]?.messages)
      const pid = Number(/pid:(\d+)/.exec(seen)?.[1])
      expect(isRunning(pid)).toBe(true)

      await host.close()
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
      await session.prompt('before')
      await expect(session.command('mcp')).resolves.toBe(
        'demo: failed: Not signed in. Run /connect demo.',
      )

      const browser = approveSignIns(session, 'code-1')
      cleanups.push(browser.stop)
      await expect(session.command('connect:demo')).resolves.toBe(
        'Connected to demo.',
      )
      await session.prompt('after')

      expect(model.toolNames(0)).toEqual([])
      expect(model.toolNames(1)).toEqual(['demo_echo'])
      await expect(session.command('mcp')).resolves.toBe(
        'demo: connected (1 tool)',
      )
    })
  })
}
