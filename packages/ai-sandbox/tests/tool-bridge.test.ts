/**
 * Verifies the host-side MCP tool-proxy bridge using the MCP SDK's own HTTP
 * client (no `claude` needed): list tools + call a tool, asserting the host
 * `execute()` runs and the result comes back, plus bearer-token enforcement.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { startHostToolBridge } from '../src/tool-bridge'
import type { HostToolBridge } from '../src/tool-bridge'
import type { AnyTool } from '@tanstack/ai'

let bridge: HostToolBridge | undefined

afterEach(async () => {
  if (bridge) await bridge.close()
  bridge = undefined
})

function tool(name: string, execute: (args: unknown) => unknown): AnyTool {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object', properties: {} },
    execute,
  } as unknown as AnyTool
}

describe('startHostToolBridge', () => {
  it('serves chat() tools over MCP and proxies calls to the host', async () => {
    let calledWith: unknown
    bridge = await startHostToolBridge(
      [
        tool('getTime', (args) => {
          calledWith = args
          return 'high noon'
        }),
      ],
      { hostForSandbox: '127.0.0.1' },
    )

    const client = new Client({ name: 'test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(bridge.url), {
      requestInit: { headers: { Authorization: `Bearer ${bridge.token}` } },
    })
    await client.connect(transport)

    const list = await client.listTools()
    expect(list.tools.map((t) => t.name)).toContain('getTime')

    const result = await client.callTool({
      name: 'getTime',
      arguments: { tz: 'utc' },
    })
    expect(calledWith).toEqual({ tz: 'utc' })
    expect(JSON.stringify(result.content)).toContain('high noon')

    await client.close()
  })

  it('reports tool execution errors as MCP tool errors', async () => {
    bridge = await startHostToolBridge(
      [
        tool('boom', () => {
          throw new Error('kaboom')
        }),
      ],
      { hostForSandbox: '127.0.0.1' },
    )
    const client = new Client({ name: 'test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(bridge.url), {
      requestInit: { headers: { Authorization: `Bearer ${bridge.token}` } },
    })
    await client.connect(transport)
    const result = await client.callTool({ name: 'boom', arguments: {} })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('kaboom')
    await client.close()
  })

  it('rejects requests without the bearer token', async () => {
    bridge = await startHostToolBridge([tool('noop', () => 'ok')], {
      hostForSandbox: '127.0.0.1',
    })
    const client = new Client({ name: 'test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(bridge.url))
    await expect(client.connect(transport)).rejects.toThrow()
    await client.close().catch(() => {})
  })
})
