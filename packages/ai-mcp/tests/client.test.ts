// packages/ai-mcp/tests/client.test.ts
import { describe, expect, it } from 'vitest'
import { createMCPClient, createMCPClientFromTransport } from '../src/client'
import {
  DuplicateToolNameError,
  MCPConnectionError,
  MCPTaskRequiredToolError,
} from '../src/errors'
import {
  makeServerWithAnnotatedTool,
  makeServerWithStructuredTool,
  makeServerWithTaskRequiredTool,
  makeServerWithWeatherTool,
} from './helpers/in-memory-server'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type {
  JsonSchemaValidatorResult,
  jsonSchemaValidator,
} from '@modelcontextprotocol/sdk/validation'

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
    expect(tools[0].metadata.mcp).toMatchObject({
      serverToolName: 'get_weather',
      serverId: 'wx',
    })
  })

  it('forwards server annotations + display title on auto-discovery', async () => {
    const { clientTransport } = await makeServerWithAnnotatedTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const tool = (await client.tools()).find((t) => t.name === 'get_weather')!
    // `tools()` returns `McpServerTool`s — the read is typed as
    // `McpToolMetadata` with no annotation and no optional chaining.
    const mcp = tool.metadata.mcp
    expect(mcp.annotations).toEqual({
      title: 'Legacy Weather Title',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    })
    // Top-level `title` wins over the legacy `annotations.title`.
    expect(mcp.title).toBe('Weather Lookup')
  })

  it('forwards server annotations + display title on bound definitions', async () => {
    const { clientTransport } = await makeServerWithAnnotatedTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    const { toolDefinition } = await import('@tanstack/ai')
    const { z } = await import('zod')
    const getWeather = toolDefinition({
      name: 'get_weather',
      description: 'Get weather for a city',
      inputSchema: z.object({ city: z.string() }),
    })
    // The explicit path binds the caller's definition, but the SERVER's
    // annotations still have to reach the host (mirrors auto-discovery).
    const tools = await client.tools([getWeather])
    const mcp = tools[0].metadata.mcp
    expect(mcp.annotations?.readOnlyHint).toBe(true)
    expect(mcp.title).toBe('Weather Lookup')
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

describe('clientOptions', () => {
  /**
   * Records every schema it is asked about, and accepts everything.
   *
   * Standing in for `CfWorkerJsonSchemaValidator`, which exists precisely
   * because the SDK's default validator compiles schemas with `new Function` —
   * forbidden on Cloudflare Workers, where it fails every call to a tool that
   * declares an `outputSchema`.
   */
  function recordingValidator(): {
    schemas: Array<unknown>
    provider: jsonSchemaValidator
  } {
    const schemas: Array<unknown> = []
    return {
      schemas,
      provider: {
        getValidator<T>(schema: unknown) {
          schemas.push(schema)
          // Annotated rather than inferred: the result type is a union, and
          // without it TS widens `data` to `T | undefined` and neither branch
          // matches.
          return (input: unknown): JsonSchemaValidatorResult<T> => ({
            valid: true,
            data: input as T,
            errorMessage: undefined,
          })
        },
      },
    }
  }

  it('forwards a custom jsonSchemaValidator to the SDK client', async () => {
    const { clientTransport } = await makeServerWithStructuredTool()
    const { schemas, provider } = recordingValidator()
    await using client = await createMCPClientFromTransport(
      clientTransport,
      undefined,
      { jsonSchemaValidator: provider },
    )

    // The SDK builds every output validator during `tools/list`, not on call —
    // see `cacheToolMetadata`. This is also why the default AJV provider fails
    // an entire discovery on an edge runtime rather than a single tool call.
    await client.tools()

    expect(schemas).toEqual([expect.objectContaining({ type: 'object' })])
  })

  it('accepts clientOptions through createMCPClient', async () => {
    const { clientTransport } = await makeServerWithStructuredTool()
    const { schemas, provider } = recordingValidator()
    await using client = await createMCPClient({
      transport: clientTransport,
      clientOptions: { jsonSchemaValidator: provider },
    })

    await client.tools()

    expect(schemas).toHaveLength(1)
  })

  it('falls back to the SDK default when no clientOptions are given', async () => {
    const { clientTransport } = await makeServerWithStructuredTool()
    await using client = await createMCPClientFromTransport(clientTransport)
    await client.tools()

    const result = await client.callTool('lookup_user', { id: 'u-1' })

    expect(result.structuredContent).toEqual({ id: 'u-1', name: 'Ada' })
  })

  it('reports clientOptions on getInfo so a rebuilt client keeps them', async () => {
    // `createMcpAppCallHandler` reconnects per call from `getInfo()`. A
    // descriptor that dropped `clientOptions` would hand the rebuilt client
    // back to the SDK's AJV default — the exact failure this option exists to
    // avoid, reintroduced for every MCP Apps widget call.
    const { clientTransport } = await makeServerWithStructuredTool()
    const { provider } = recordingValidator()
    await using client = await createMCPClient({
      transport: clientTransport,
      prefix: 'weather',
      clientOptions: { jsonSchemaValidator: provider },
    })

    expect(client.getInfo().clientOptions).toEqual({
      jsonSchemaValidator: provider,
    })
  })

  it('omits clientOptions from getInfo when none were given', async () => {
    const { clientTransport } = await makeServerWithStructuredTool()
    await using client = await createMCPClientFromTransport(clientTransport)

    // `toStrictEqual` rather than reading `.clientOptions`: the contract is that
    // the key is OMITTED, and `toBeUndefined()` passes either way.
    expect(client.getInfo()).toStrictEqual({
      transport: undefined,
      prefix: undefined,
    })
  })
})
