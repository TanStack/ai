import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  callMcpTool,
  makeMcpExecute,
  mcpContentToTanstack,
  toServerTools,
} from '../src/tools'
import {
  makeServerWithFailingTool,
  makeServerWithWeatherTool,
} from './helpers/in-memory-server'
import type {
  CallToolResult,
  Tool as McpToolDef,
} from '@modelcontextprotocol/sdk/types.js'
import type { ServerTool } from '@tanstack/ai'

/**
 * Build an MCP tool definition for `toServerTools`. The MCP-Apps `_meta.ui`
 * link is a custom extension not present in the SDK's base `Tool` schema, so
 * the assembled literal needs one cast to `McpToolDef` — centralized here
 * instead of scattering `as never` across each test def.
 */
function mcpToolDef(def: {
  name: string
  description?: string
  inputSchema?: { type: 'object'; properties?: Record<string, unknown> }
  execution?: { taskSupport?: 'optional' | 'required' | 'forbidden' }
  _meta?: { ui?: { resourceUri?: string } }
}): McpToolDef {
  return {
    inputSchema: { type: 'object', properties: {} },
    ...def,
  } as McpToolDef
}

/**
 * Build a fake MCP `Client` that only implements `callTool` — the single
 * method `makeMcpExecute` invokes. The MCP SDK `Client` is a wide concrete
 * class with no structural overlap with this partial, so TS requires the
 * `unknown` bridge; the `callTool` shape itself stays fully typed.
 */
function fakeMcpClient(
  callTool: (...args: Array<any>) => Promise<CallToolResult>,
): Client {
  return { callTool } as unknown as Client
}

describe('mcpContentToTanstack', () => {
  it('returns a plain string for a single text block', () => {
    expect(mcpContentToTanstack([{ type: 'text', text: 'hello' }])).toBe(
      'hello',
    )
  })

  it('maps multi-block arrays to ContentParts', () => {
    expect(
      mcpContentToTanstack([
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ]),
    ).toEqual([
      { type: 'text', content: 'a' },
      { type: 'text', content: 'b' },
    ])
  })

  it('maps image blocks to data-source image parts', () => {
    const image = { type: 'image', data: 'aGk=', mimeType: 'image/png' }
    expect(
      mcpContentToTanstack([image, { type: 'text', text: 'caption' }]),
    ).toEqual([
      {
        type: 'image',
        source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
      },
      { type: 'text', content: 'caption' },
    ])
  })

  it('stringifies resource blocks as text parts', () => {
    const resource = {
      type: 'resource',
      resource: { uri: 'file:///x.txt', text: 'x' },
    }
    expect(
      mcpContentToTanstack([resource, { type: 'text', text: 'y' }]),
    ).toEqual([
      { type: 'text', content: JSON.stringify(resource.resource) },
      { type: 'text', content: 'y' },
    ])
  })

  it('stringifies unknown block types as text parts', () => {
    const unknown = { type: 'audio', data: 'zzz' }
    expect(
      mcpContentToTanstack([unknown, { type: 'text', text: 'y' }]),
    ).toEqual([
      { type: 'text', content: JSON.stringify(unknown) },
      { type: 'text', content: 'y' },
    ])
  })

  it('returns "" when content is undefined (structuredContent-only result)', () => {
    // The parameter is typed `Array<any>`, but the runtime guards `undefined`
    // (an MCP result can carry only structuredContent, no content[]). The type
    // doesn't model that case, so a cast is the only way to exercise the guard.
    expect(mcpContentToTanstack(undefined as never)).toBe('')
  })

  it('excludes ui:// resource blocks from model-facing text', () => {
    // ui:// resources are display widgets — they must never leak into the
    // model's context as text. A mixed array that contains a ui:// resource
    // alongside a normal text block should return only the text part.
    expect(
      mcpContentToTanstack([
        {
          type: 'resource',
          resource: { uri: 'ui://x', mimeType: 'text/html', text: '<b>w</b>' },
        },
        { type: 'text', text: 'hello' },
      ]),
    ).toEqual([{ type: 'text', content: 'hello' }])
  })
})

describe('callMcpTool', () => {
  it('drains task status updates and returns the terminal result', async () => {
    const controller = new AbortController()
    const callToolStream = vi.fn(() =>
      (async function* () {
        yield {
          type: 'taskStatus' as const,
          task: {
            taskId: 'task-1',
            status: 'working' as const,
            createdAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
            ttl: 60_000,
          },
        }
        yield {
          type: 'result' as const,
          result: { content: [{ type: 'text' as const, text: 'done' }] },
        }
      })(),
    )
    const client = {
      experimental: { tasks: { callToolStream } },
    } as unknown as Client

    await expect(
      callMcpTool(client, 'research', { query: 'x' }, true, controller.signal),
    ).resolves.toEqual({ content: [{ type: 'text', text: 'done' }] })
    expect(callToolStream).toHaveBeenCalledWith(
      { name: 'research', arguments: { query: 'x' } },
      expect.anything(),
      { signal: controller.signal },
    )
  })

  it('throws a terminal task-stream error', async () => {
    const error = new Error('task failed')
    const client = {
      experimental: {
        tasks: {
          callToolStream: () =>
            (async function* () {
              yield { type: 'error' as const, error }
            })(),
        },
      },
    } as unknown as Client

    await expect(callMcpTool(client, 'research', {}, true)).rejects.toBe(error)
  })

  it('throws if a task stream ends without a terminal message', async () => {
    const client = {
      experimental: {
        tasks: {
          callToolStream: () =>
            (async function* () {
              yield {
                type: 'taskStatus' as const,
                task: {
                  taskId: 'task-1',
                  status: 'working' as const,
                  createdAt: new Date().toISOString(),
                  lastUpdatedAt: new Date().toISOString(),
                  ttl: 60_000,
                },
              }
            })(),
        },
      },
    } as unknown as Client

    await expect(callMcpTool(client, 'research', {}, true)).rejects.toThrow(
      /ended without a result or error/,
    )
  })
})

describe('makeMcpExecute', () => {
  it('throws an error naming the tool when the MCP tool returns isError', async () => {
    const { clientTransport } = await makeServerWithFailingTool()
    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(clientTransport)
    const defs = (await client.listTools()).tools
    const tools = toServerTools(client, defs, {
      prefix: undefined,
      lazy: false,
    })
    const tool = tools.find((t) => t.name === 'always_fails')!
    await expect(
      tool.execute!({}, { toolCallId: 't', emitCustomEvent: () => {} }),
    ).rejects.toThrow(/always_fails.*boom/)
    await client.close()
  })

  it('throws the bare error message (no dangling colon) when the error detail is empty', async () => {
    // A ui://-only error body normalizes to '' — treat it like undefined and
    // throw "returned an error" with no trailing colon.
    const callTool = vi.fn().mockResolvedValue({
      isError: true,
      content: [{ type: 'resource', resource: { uri: 'ui://widget' } }],
    })
    const execute = makeMcpExecute(fakeMcpClient(callTool), 'x', false)
    await expect(execute({})).rejects.toThrow(/MCP tool "x" returned an error$/)
  })

  it('forwards the abortSignal to client.callTool', async () => {
    const callTool = vi
      .fn()
      .mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
    const client = { callTool } as unknown as Client
    const controller = new AbortController()
    const execute = makeMcpExecute(client, 'x', false)
    await expect(execute({}, { abortSignal: controller.signal })).resolves.toBe(
      'ok',
    )
    expect(callTool).toHaveBeenCalledWith(
      { name: 'x', arguments: {} },
      expect.anything(),
      { signal: controller.signal },
    )
  })

  it('rejects without calling the server when the signal is already aborted', async () => {
    const callTool = vi.fn()
    const client = { callTool } as unknown as Client
    const controller = new AbortController()
    controller.abort()
    const execute = makeMcpExecute(client, 'x', false)
    await expect(
      execute({}, { abortSignal: controller.signal }),
    ).rejects.toThrow()
    expect(callTool).not.toHaveBeenCalled()
  })

  it('prefers structuredContent when the tool declares an outputSchema', async () => {
    const callTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"temperature":72}' }],
      structuredContent: { temperature: 72 },
    })
    const client = { callTool } as unknown as Client
    const execute = makeMcpExecute(client, 'x', true)
    await expect(execute({})).resolves.toEqual({ temperature: 72 })
  })

  it('falls back to content[] when preferStructured is false', async () => {
    const callTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'plain' }],
      structuredContent: { ignored: true },
    })
    const client = { callTool } as unknown as Client
    const execute = makeMcpExecute(client, 'x', false)
    await expect(execute({})).resolves.toBe('plain')
  })
})

/** The MCP-Apps metadata block `toServerTools` stamps onto each tool. */
interface ToolMcpMeta {
  serverToolName?: string
  serverId?: string
  uiResourceUri?: string
}

/**
 * Read the `mcp` metadata block off a produced ServerTool. `metadata` is
 * `Record<string, any>` upstream, so the access is already `any` — annotating
 * the return documents the real shape without a cast.
 */
function readToolMcpMeta(tool: ServerTool): ToolMcpMeta {
  return tool.metadata!.mcp
}

describe('toServerTools — MCP Apps metadata', () => {
  it('captures serverId (prefix) and the _meta.ui.resourceUri link', () => {
    const tool = toServerTools(
      fakeMcpClient(vi.fn()),
      [
        mcpToolDef({
          name: 'show_widget',
          description: 'show',
          _meta: { ui: { resourceUri: 'ui://srv/widget' } },
        }),
      ],
      { prefix: 'weather' },
    )[0]!
    expect(tool.name).toBe('weather_show_widget')
    expect(tool.metadata).toMatchObject({
      mcp: {
        serverToolName: 'show_widget',
        serverId: 'weather',
        uiResourceUri: 'ui://srv/widget',
      },
    })
  })

  it('leaves uiResourceUri undefined for plain tools', () => {
    const tool = toServerTools(
      fakeMcpClient(vi.fn()),
      [mcpToolDef({ name: 't' })],
      {},
    )[0]!
    const mcp = readToolMcpMeta(tool)
    expect(mcp.uiResourceUri).toBeUndefined()
    expect(mcp.serverId).toBeUndefined()
  })
})

describe('toServerTools', () => {
  it('discovers tools and proxies execute to callTool', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(clientTransport)

    const defs = (await client.listTools()).tools
    const tools = toServerTools(client, defs, {
      prefix: undefined,
      lazy: false,
    })

    expect(tools.map((t) => t.name)).toContain('get_weather')
    const tool = tools.find((t) => t.name === 'get_weather')!
    const result = await tool.execute!(
      { city: 'Brooklyn' },
      {
        toolCallId: 't',
        emitCustomEvent: () => {},
      },
    )
    expect(JSON.stringify(result)).toContain('Sunny in Brooklyn')
    await client.close()
  })

  it('keeps task-optional tools on ordinary callTool execution', async () => {
    const callTool = vi
      .fn()
      .mockResolvedValue({ content: [{ type: 'text', text: 'plain' }] })
    const tools = toServerTools(
      fakeMcpClient(callTool),
      [
        mcpToolDef({
          name: 'optional_task',
          execution: { taskSupport: 'optional' },
        }),
      ],
      {},
    )

    await expect(tools[0]!.execute!({})).resolves.toBe('plain')
    expect(callTool).toHaveBeenCalledOnce()
  })

  it('applies a prefix', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(clientTransport)
    const defs = (await client.listTools()).tools
    const tools = toServerTools(client, defs, { prefix: 'wx', lazy: false })
    expect(tools.map((t) => t.name)).toContain('wx_get_weather')
    await client.close()
  })
})
