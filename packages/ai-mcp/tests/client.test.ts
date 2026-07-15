// packages/ai-mcp/tests/client.test.ts
import { describe, expect, it } from 'vitest'
import { createMCPClient, createMCPClientFromTransport } from '../src/client'
import {
  DuplicateToolNameError,
  MCPConnectionError,
  MCPTaskRequiredToolError,
} from '../src/errors'
import {
  makeServerWithTaskRequiredTool,
  makeServerWithWeatherTool,
} from './helpers/in-memory-server'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

describe('createMCPClient', () => {
  it('connects and returns discovered tools', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const tools = await client.tools()
    expect(tools.map((t) => t.name)).toContain('get_weather')
    expect(client.capabilities).toBeDefined()
  })

  it('binds passed toolDefinitions to the server, typed + validated', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const { toolDefinition } = await import('@tanstack/ai')
    const { z } = await import('zod')
    const getWeather = toolDefinition({
      name: 'get_weather',
      description: 'Get weather for a city',
      inputSchema: z.object({ city: z.string() }),
    })
    const tools = await client.tools([getWeather])
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('get_weather')
    const result = await tools[0].execute!(
      { city: 'Brooklyn' },
      {
        toolCallId: 't',
        emitCustomEvent: () => {},
      },
    )
    expect(JSON.stringify(result)).toContain('Sunny in Brooklyn')
  })

  it('throws MCPToolNotFoundError for a definition the server lacks', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const { toolDefinition } = await import('@tanstack/ai')
    const { z } = await import('zod')
    const ghost = toolDefinition({
      name: 'does_not_exist',
      description: 'A tool that does not exist on the server',
      inputSchema: z.object({}),
    })
    await expect(client.tools([ghost])).rejects.toThrow(/does_not_exist/)
  })

  it('throws DuplicateToolNameError when bound defs collide within one tools() call', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const { toolDefinition } = await import('@tanstack/ai')
    const { z } = await import('zod')
    const getWeather = toolDefinition({
      name: 'get_weather',
      description: 'Get weather for a city',
      inputSchema: z.object({ city: z.string() }),
    })
    // Two defs resolving to the same final tool name trip the client's own
    // duplicate guard (single tools() call).
    await expect(client.tools([getWeather, getWeather])).rejects.toThrow(
      DuplicateToolNameError,
    )
  })

  it('applies the client prefix to bound definitions', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    await using client = await createMCPClientFromTransport(
      clientTransport,
      'wx',
    )
    const { toolDefinition } = await import('@tanstack/ai')
    const { z } = await import('zod')
    const getWeather = toolDefinition({
      name: 'get_weather',
      description: 'Get weather for a city',
      inputSchema: z.object({ city: z.string() }),
    })
    const tools = await client.tools([getWeather])
    expect(tools[0].name).toBe('wx_get_weather')
  })

  it('stamps mcp.serverToolName + serverId on bound definitions', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    await using client = await createMCPClientFromTransport(
      clientTransport,
      'wx',
    )
    const { toolDefinition } = await import('@tanstack/ai')
    const { z } = await import('zod')
    const getWeather = toolDefinition({
      name: 'get_weather',
      description: 'Get weather for a city',
      inputSchema: z.object({ city: z.string() }),
    })
    const tools = await client.tools([getWeather])
    // The runtime name is prefixed, but the UNPREFIXED native name + serverId
    // must be recoverable from metadata (mirrors auto-discovery).
    expect(tools[0].metadata?.mcp).toMatchObject({
      serverToolName: 'get_weather',
      serverId: 'wx',
    })
  })

  it('excludes task-required tools from auto-discovery', async () => {
    const { clientTransport } = await makeServerWithTaskRequiredTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const names = (await client.tools()).map((t) => t.name)
    expect(names).toContain('get_weather')
    expect(names).not.toContain('research_task')
  })

  it('throws MCPTaskRequiredToolError when binding a task-required tool', async () => {
    const { clientTransport } = await makeServerWithTaskRequiredTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const { toolDefinition } = await import('@tanstack/ai')
    const { z } = await import('zod')
    const researchTask = toolDefinition({
      name: 'research_task',
      description: 'A long-running tool that requires task-based execution',
      inputSchema: z.object({ query: z.string() }),
    })
    await expect(client.tools([researchTask])).rejects.toThrow(
      MCPTaskRequiredToolError,
    )
  })

  it('wraps connection failures in MCPConnectionError preserving the cause', async () => {
    const broken: Transport = {
      start: async () => {
        throw new Error('nope')
      },
      send: async () => {},
      close: async () => {},
    }
    const err: unknown = await createMCPClientFromTransport(broken).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(MCPConnectionError)
    expect((err as MCPConnectionError).cause).toBeInstanceOf(Error)
  })

  it('callTool proxies directly to the server and returns CallToolResult', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const result = await client.callTool('get_weather', { city: 'Tokyo' })
    expect(result.isError).toBeFalsy()
    expect(
      Array.isArray(result.content) &&
        result.content.some(
          (c: { type: string; text?: string }) =>
            c.type === 'text' && c.text?.includes('Tokyo'),
        ),
    ).toBe(true)
  })

  it('callTool throws MCPConnectionError when client is closed', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    const client = await createMCPClientFromTransport(clientTransport)
    await client.close()
    await expect(
      client.callTool('get_weather', { city: 'Tokyo' }),
    ).rejects.toThrow(MCPConnectionError)
  })

  it('close() is idempotent', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    const client = await createMCPClientFromTransport(clientTransport)
    await client.close()
    await expect(client.close()).resolves.toBeUndefined()
  })

  it('getInfo() retains no transport when createMCPClient is given a Transport instance', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    await using client = await createMCPClient({
      transport: clientTransport,
      prefix: 'wx',
    })
    // A ready-made Transport instance is single-use / not reconnectable, so
    // only serializable transport configs are retained as a descriptor.
    expect(client.getInfo()).toEqual({ transport: undefined, prefix: 'wx' })
  })

  it('getInfo() returns an undefined transport for a client built from a raw Transport', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    await using client = await createMCPClientFromTransport(
      clientTransport,
      'wx',
    )
    expect(client.getInfo()).toEqual({ transport: undefined, prefix: 'wx' })
  })

  it('closes on asyncDispose', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    let client: Awaited<ReturnType<typeof createMCPClientFromTransport>>
    {
      await using c = await createMCPClientFromTransport(clientTransport)
      client = c
      expect(await c.tools()).toBeDefined()
    }
    // after scope exit the client is closed; calling tools() rejects
    await expect(client.tools()).rejects.toThrow()
  })
})
