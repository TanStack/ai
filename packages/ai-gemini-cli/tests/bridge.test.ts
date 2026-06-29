import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { startToolBridge } from '../src/tools/bridge'
import type { AnyTool } from '@tanstack/ai'

function makeTool(overrides: Partial<AnyTool> = {}): AnyTool {
  return {
    name: 'echo',
    description: 'Echo the input back',
    inputSchema: {
      type: 'object',
      properties: { value: { type: 'string' } },
    },
    execute: async (args: unknown) => args,
    ...overrides,
  } as unknown as AnyTool
}

async function connectClient(url: string): Promise<Client> {
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url)))
  return client
}

describe('startToolBridge', () => {
  it('listens on an ephemeral localhost port', async () => {
    const bridge = await startToolBridge([makeTool()])
    try {
      expect(bridge.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
    } finally {
      await bridge.close()
    }
  })

  it('lists tools with their JSON schemas passed through verbatim', async () => {
    const bridge = await startToolBridge([makeTool()])
    try {
      const client = await connectClient(bridge.url)
      const { tools } = await client.listTools()
      expect(tools).toHaveLength(1)
      expect(tools[0]).toMatchObject({
        name: 'echo',
        description: 'Echo the input back',
        inputSchema: {
          type: 'object',
          properties: { value: { type: 'string' } },
        },
      })
      await client.close()
    } finally {
      await bridge.close()
    }
  })

  it('executes tool calls and returns stringified results', async () => {
    const bridge = await startToolBridge([
      makeTool({
        execute: async (args: unknown) => ({
          echoed: (args as { value: string }).value,
        }),
      } as Partial<AnyTool>),
    ])
    try {
      const client = await connectClient(bridge.url)
      const result = await client.callTool({
        name: 'echo',
        arguments: { value: 'hi' },
      })
      expect(result.content).toEqual([
        { type: 'text', text: JSON.stringify({ echoed: 'hi' }) },
      ])
      await client.close()
    } finally {
      await bridge.close()
    }
  })

  it('returns isError content when the tool throws', async () => {
    const bridge = await startToolBridge([
      makeTool({
        execute: async () => {
          throw new Error('tool blew up')
        },
      } as Partial<AnyTool>),
    ])
    try {
      const client = await connectClient(bridge.url)
      const result = await client.callTool({
        name: 'echo',
        arguments: {},
      })
      expect(result.isError).toBe(true)
      expect(result.content).toEqual([
        { type: 'text', text: 'Tool execution failed: tool blew up' },
      ])
      await client.close()
    } finally {
      await bridge.close()
    }
  })

  it('refuses connections after close()', async () => {
    const bridge = await startToolBridge([makeTool()])
    await bridge.close()
    await expect(connectClient(bridge.url)).rejects.toThrow()
  })
})
