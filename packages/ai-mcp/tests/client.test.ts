// packages/ai-mcp/tests/client.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createMCPClient, createMCPClientFromTransport } from '../src/client'
import {
  DuplicateToolNameError,
  MCPConnectionError,
  MCPTaskRequiredToolError,
} from '../src/errors'
import {
  makeServerWithBrokenToolList,
  makeServerWithChangingTools,
  makeServerWithLaxOutputSchemaTool,
  makeServerWithPaginatedTools,
  makeServerWithPendingTaskTool,
  makeServerWithTaskRequiredTool,
  makeServerWithUnsupportedTaskTool,
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

  it('discovers and executes task-required tools', async () => {
    const { clientTransport } = await makeServerWithTaskRequiredTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const tools = await client.tools()
    expect(tools.map((t) => t.name)).toEqual(['get_weather', 'research_task'])
    const research = tools.find((tool) => tool.name === 'research_task')!
    await expect(
      research.execute!(
        { query: 'MCP tasks' },
        { toolCallId: 't', emitCustomEvent: () => {} },
      ),
    ).resolves.toBe('Research complete: MCP tasks')
  })

  it('binds and executes a task-required tool definition', async () => {
    const { clientTransport } = await makeServerWithTaskRequiredTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const { toolDefinition } = await import('@tanstack/ai')
    const { z } = await import('zod')
    const researchTask = toolDefinition({
      name: 'research_task',
      description: 'A long-running tool that requires task-based execution',
      inputSchema: z.object({ query: z.string() }),
    })
    const [tool] = await client.tools([researchTask])
    await expect(
      tool!.execute!(
        { query: 'typed tasks' },
        { toolCallId: 't', emitCustomEvent: () => {} },
      ),
    ).resolves.toBe('Research complete: typed tasks')
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

  it('callTool executes task-required tools and returns the raw result', async () => {
    const { clientTransport } = await makeServerWithTaskRequiredTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const result = await client.callTool('research_task', {
      query: 'direct tasks',
    })
    expect(result.content).toEqual([
      { type: 'text', text: 'Research complete: direct tasks' },
    ])
  })

  it('tools() follows tools/list pagination across pages', async () => {
    const { clientTransport } = await makeServerWithPaginatedTools()
    await using client = await createMCPClientFromTransport(clientTransport)
    const tools = await client.tools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'first_page_tool',
      'second_page_tool',
    ])
  })

  it('callTool does not re-list for a name absent from the cached list', async () => {
    const { clientTransport, getListRequests } =
      await makeServerWithPaginatedTools()
    await using client = await createMCPClientFromTransport(clientTransport)
    await client.tools()
    const listed = getListRequests()
    const result = await client.callTool('not_listed')
    expect(result.content).toEqual([
      { type: 'text', text: 'called not_listed' },
    ])
    await client.callTool('not_listed')
    expect(getListRequests()).toBe(listed)
  })

  it('callTool falls back to a plain call when tools/list fails', async () => {
    const { clientTransport } = await makeServerWithBrokenToolList()
    await using client = await createMCPClientFromTransport(clientTransport)
    const result = await client.callTool('anything')
    expect(result.content).toEqual([{ type: 'text', text: 'called anything' }])
  })

  it('direct callTool without prior discovery stays validation-free', async () => {
    const { clientTransport } = await makeServerWithLaxOutputSchemaTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    // The tool declares an outputSchema but returns only text content — the
    // raw result must come back, not the SDK's strict structured-content error.
    const result = await client.callTool('lax_tool')
    expect(result.content).toEqual([{ type: 'text', text: 'called lax_tool' }])
  })

  it('excludes task-required tools when the server lacks the tasks capability', async () => {
    const { clientTransport } = await makeServerWithUnsupportedTaskTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const tools = await client.tools()
    expect(tools.map((t) => t.name)).toEqual(['plain_tool'])
  })

  it('throws MCPTaskRequiredToolError when binding a task-required tool the server cannot execute', async () => {
    const { clientTransport } = await makeServerWithUnsupportedTaskTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const { toolDefinition } = await import('@tanstack/ai')
    const { z } = await import('zod')
    const needsTasks = toolDefinition({
      name: 'needs_tasks',
      description: 'Requires tasks the server cannot execute',
      inputSchema: z.object({}),
    })
    await expect(client.tools([needsTasks])).rejects.toBeInstanceOf(
      MCPTaskRequiredToolError,
    )
  })

  it('callTool rejects immediately when the signal is already aborted', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const controller = new AbortController()
    controller.abort()
    await expect(
      client.callTool(
        'get_weather',
        { city: 'Berlin' },
        { signal: controller.signal },
      ),
    ).rejects.toThrow()
  })

  it('cancels the remote task when callTool is aborted mid-poll', async () => {
    const { clientTransport, taskStore } = await makeServerWithPendingTaskTool()
    const sent: Array<string> = []
    const origSend = clientTransport.send.bind(clientTransport)
    clientTransport.send = (message, sendOptions) => {
      if ('method' in message && typeof message.method === 'string') {
        sent.push(message.method)
      }
      return origSend(message, sendOptions)
    }
    await using client = await createMCPClientFromTransport(clientTransport)
    const controller = new AbortController()
    const pending = client.callTool(
      'slow_task',
      { query: 'q' },
      { signal: controller.signal },
    )
    // Wait until the task exists server-side, then abort the poll loop.
    await vi.waitFor(async () => {
      const { tasks } = await taskStore.listTasks()
      expect(tasks).toHaveLength(1)
    })
    controller.abort()
    await expect(pending).rejects.toThrow()
    await vi.waitFor(() => {
      expect(sent).toContain('tasks/cancel')
    })
  })

  it('re-lists tools after a tools/list_changed notification', async () => {
    const { server, clientTransport, getListRequests } =
      await makeServerWithChangingTools()
    await using client = await createMCPClientFromTransport(clientTransport)
    await client.callTool('tool_a')
    const listed = getListRequests()
    await client.callTool('tool_a')
    expect(getListRequests()).toBe(listed) // cached — no re-list
    await server.sendToolListChanged()
    await vi.waitFor(async () => {
      await client.callTool('tool_a')
      expect(getListRequests()).toBeGreaterThan(listed)
    })
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
