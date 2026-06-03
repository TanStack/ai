// packages/ai-mcp/tests/client.test.ts
import { describe, expect, it } from 'vitest'
import { makeServerWithWeatherTool } from './helpers/in-memory-server'
import { createMCPClientFromTransport } from '../src/client'
import { DuplicateToolNameError } from '../src/errors'

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
    const result = await tools[0].execute!({ city: 'Brooklyn' }, {
      toolCallId: 't',
      emitCustomEvent: () => {},
    })
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

  it('throws DuplicateToolNameError when discovered tools collide', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const a = await client.tools()
    const b = await client.tools()
    expect(() => {
      const seen = new Set<string>()
      for (const t of [...a, ...b]) {
        if (seen.has(t.name)) throw new DuplicateToolNameError(t.name)
        seen.add(t.name)
      }
    }).toThrow(DuplicateToolNameError)
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
