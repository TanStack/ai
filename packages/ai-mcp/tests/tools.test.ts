import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  makeMcpExecute,
  mcpContentToTanstack,
  toServerTools,
} from '../src/tools'
import {
  makeServerWithFailingTool,
  makeServerWithWeatherTool,
} from './helpers/in-memory-server'

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
    const client = { callTool } as unknown as Client
    const execute = makeMcpExecute(client, 'x', false)
    await expect(execute({})).rejects.toThrow(
      /MCP tool "x" returned an error$/,
    )
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
      undefined,
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

describe('toServerTools — MCP Apps metadata', () => {
  it('captures serverId (prefix) and the _meta.ui.resourceUri link', () => {
    const fakeClient = {} as never
    const tool = toServerTools(
      fakeClient,
      [
        {
          name: 'show_widget',
          description: 'show',
          inputSchema: { type: 'object', properties: {} },
          _meta: { ui: { resourceUri: 'ui://srv/widget' } },
        } as never,
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
      {} as never,
      [
        {
          name: 't',
          description: '',
          inputSchema: { type: 'object', properties: {} },
        } as never,
      ],
      {},
    )[0]!
    expect(
      (tool.metadata as { mcp: { uiResourceUri?: string } }).mcp.uiResourceUri,
    ).toBeUndefined()
    expect(
      (tool.metadata as { mcp: { serverId?: string } }).mcp.serverId,
    ).toBeUndefined()
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
