import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { mcpConnector } from '../src/connector'
import { recorder } from './connector-helpers'
import type { AnyTool } from '@tanstack/ai'
import type { MCPClientOptions } from '../src/types'

// Each connect of the connector gets a fake client. The test keeps the
// options of each connect, so it can close a connection or change its
// tool list like a server does.
const connects = vi.hoisted(() => ({
  options: [] as Array<unknown>,
  tools: [] as Array<Array<string>>,
}))
vi.mock('../src/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client')>()
  return {
    ...actual,
    connectTransport: async (options: unknown) => {
      const index = connects.options.length
      connects.options.push(options)
      connects.tools.push(['echo'])
      return {
        tools: async () =>
          (connects.tools[index] ?? []).map(
            (name): AnyTool => ({
              name: `demo_${name}`,
              description: name,
              execute: async () => name,
            }),
          ),
        close: async () => {},
      }
    },
  }
})

const cleanups: Array<() => unknown> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  connects.options.length = 0
  connects.tools.length = 0
})

/** The callbacks that connect `index` gave the client. */
function eventsOf(index: number) {
  const options = connects.options[index] as Pick<
    MCPClientOptions,
    'onClose' | 'onToolListChanged'
  >
  return options
}

describe('mcpConnector connection events', () => {
  it('lists the tools again after tools/list_changed, and connects again after a close', async () => {
    const credentials = memoryCredentialStore()
    await credentials.set({
      scope: { threadId: 't', userId: 'user-1' },
      id: 'demo',
      credential: { type: 'oauth', accessToken: 'access-1' },
    })
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      credentials,
    })
    cleanups.push(() => host.close())
    const model = recorder()
    const session = await host.open(
      defineHarness({
        name: 'test/connector-events',
        adapter: model.adapter,
        plugins: () => [
          mcpConnector({ id: 'demo', label: 'Demo', url: 'http://mcp.test' }),
        ],
      }),
      { threadId: 't', user: { id: 'user-1' } },
    )

    await session.send('one')
    expect(model.toolNames(0)).toEqual(['demo_echo'])

    // The server adds a tool and says so.
    connects.tools[0] = ['echo', 'time']
    eventsOf(0).onToolListChanged?.()
    await session.send('two')
    expect(model.toolNames(1)).toEqual(['demo_echo', 'demo_time'])
    expect(connects.options).toHaveLength(1)

    // The connection drops: the next turn connects again.
    eventsOf(0).onClose?.()
    await session.send('three')
    expect(connects.options).toHaveLength(2)
    expect(model.toolNames(2)).toEqual(['demo_echo'])
  })
})
