import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createToolBridge } from '../src/tools/bridge'
import type { AnyTool } from '@tanstack/ai'

const lookupUser: AnyTool = {
  name: 'lookup_user',
  description: 'Look up a user by id',
  inputSchema: {
    type: 'object',
    properties: { userId: { type: 'string' } },
    required: ['userId'],
  },
  execute: async (args: { userId: string }) => ({
    id: args.userId,
    name: 'Ada',
  }),
} as AnyTool

async function connect(tools: Array<AnyTool>) {
  const bridge = createToolBridge(tools)
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await bridge.instance.connect(serverTransport)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await client.connect(clientTransport)
  return client
}

describe('createToolBridge', () => {
  it('returns an sdk-type MCP server config named tanstack', () => {
    const bridge = createToolBridge([lookupUser])
    expect(bridge.type).toBe('sdk')
    expect(bridge.name).toBe('tanstack')
    expect(bridge.instance).toBeDefined()
  })

  it('lists tools with their raw JSON schema', async () => {
    const client = await connect([lookupUser])
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      name: 'lookup_user',
      description: 'Look up a user by id',
      inputSchema: {
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId'],
      },
    })
  })

  it('executes the tool and serializes object results to JSON text', async () => {
    const client = await connect([lookupUser])
    const result = await client.callTool({
      name: 'lookup_user',
      arguments: { userId: 'u-1' },
    })
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify({ id: 'u-1', name: 'Ada' }) },
    ])
    expect(result.isError ?? false).toBe(false)
  })

  it('passes string results through without double-encoding', async () => {
    const echo: AnyTool = {
      name: 'echo',
      description: 'Echo input',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => 'plain text result',
    } as AnyTool
    const client = await connect([echo])
    const result = await client.callTool({ name: 'echo', arguments: {} })
    expect(result.content).toEqual([
      { type: 'text', text: 'plain text result' },
    ])
  })

  it('marks thrown tool errors with isError', async () => {
    const failing: AnyTool = {
      name: 'failing',
      description: 'Always fails',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        throw new Error('tool blew up')
      },
    } as AnyTool
    const client = await connect([failing])
    const result = await client.callTool({ name: 'failing', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      { type: 'text', text: expect.stringContaining('tool blew up') },
    ])
  })

  it('rejects calls to unknown tools', async () => {
    const client = await connect([lookupUser])
    await expect(
      client.callTool({ name: 'nope', arguments: {} }),
    ).rejects.toThrow()
  })
})
