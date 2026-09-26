import { describe, expect, it, vi } from 'vitest'
import {
  Client,
  DEFAULT_REQUEST_TIMEOUT_MSEC,
  InMemoryTransport,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/client'
import {
  ProtocolError,
  ProtocolErrorCode,
  inputRequired,
  Server,
} from '@modelcontextprotocol/server'
import { MCPInputRequiredError } from '../src/input-required'
import {
  callMcpTool,
  extractUiResourceUri,
  makeMcpExecute,
  mcpContentToTanstack,
  toServerTools,
} from '../src/tools'
import {
  makeServerWithFailingTool,
  makeServerWithPendingTaskTool,
  makeServerWithTaskRequiredTool,
  makeServerWithWeatherTool,
} from './helpers/in-memory-server'
import type {
  CallToolResult,
  Tool as McpToolDef,
  Transport,
} from '@modelcontextprotocol/client'

/**
 * Build an MCP tool definition for `toServerTools`. The MCP-Apps `_meta.ui`
 * link is a custom extension not present in the SDK's base `Tool` schema, so
 * the assembled literal needs one cast to `McpToolDef` — centralized here
 * instead of scattering `as never` across each test def.
 */
function mcpToolDef(def: {
  name: string
  title?: string
  description?: string
  inputSchema?: { type: 'object'; properties?: Record<string, unknown> }
  execution?: { taskSupport?: 'optional' | 'required' | 'forbidden' }
  annotations?: {
    title?: string
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
  _meta?: { ui?: { resourceUri?: string } }
}): McpToolDef {
  return {
    inputSchema: { type: 'object', properties: {} },
    ...def,
  } as McpToolDef
}

/**
 * Build a fake MCP `Client` that only implements the methods these tests call.
 * `Client` is a concrete class, so a partial object is not assignable.
 * The `unknown` bridge is the only way to pass the partial.
 * `callTool` itself stays fully typed.
 */
function fakeMcpClient(
  callTool: (...args: Array<any>) => Promise<CallToolResult>,
): Client {
  return {
    callTool,
    getServerCapabilities: () => undefined,
    getProtocolEra: () => undefined,
  } as unknown as Client
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
    expect(mcpContentToTanstack(undefined)).toBe('')
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

const modernProtocolVersions = [...SUPPORTED_PROTOCOL_VERSIONS, '2026-07-28']

function taskClock() {
  const now = new Date().toISOString()
  return { createdAt: now, lastUpdatedAt: now }
}

async function connectClient(transport: Transport) {
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(transport)
  return client
}

/**
 * The in-memory server answers `server/discover` only after its era is modern.
 * The server has no public setter for that era.
 */
function modernInputServer() {
  const server = new Server(
    { name: 'ask', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      supportedProtocolVersions: modernProtocolVersions,
    },
  )
  Object.assign(server, { _negotiatedProtocolVersion: '2026-07-28' })
  return server
}

async function inputRequiredFrom(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(MCPInputRequiredError)
    if (!(error instanceof MCPInputRequiredError)) {
      throw new Error('expected MCPInputRequiredError')
    }
    return error
  }
  throw new Error('expected MCPInputRequiredError')
}

async function connectModernClient(server: Server) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client(
    { name: 'test', version: '1.0.0' },
    {
      versionNegotiation: { mode: { pin: '2026-07-28' } },
      capabilities: {
        elicitation: { form: {} },
        sampling: {},
      },
    },
  )
  await client.connect(clientTransport)
  return client
}

describe('callMcpTool', () => {
  it('returns a normal tool result when a spec 2025 task ends', async () => {
    const { clientTransport, server } = await makeServerWithTaskRequiredTool()
    const client = await connectClient(clientTransport)
    try {
      const defs = (await client.listTools()).tools
      const tools = toServerTools(client, defs, {
        prefix: undefined,
        lazy: false,
      })
      const tool = tools.find((item) => item.name === 'research_task')
      expect(tool).toBeDefined()
      const result = await tool!.execute!(
        { query: 'tide' },
        { toolCallId: 't', emitCustomEvent: () => {} },
      )
      expect(result).toBe('Research complete: tide')
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('throws when a spec 2025 task fails', async () => {
    const clock = taskClock()
    const server = new Server(
      { name: 'job', version: '1.0.0' },
      {
        capabilities: {
          tools: {},
          tasks: { requests: { tools: { call: {} } } },
        },
      },
    )
    server.setRequestHandler('tools/call', () => ({
      content: [{ type: 'text', text: 'nope' }],
      task: {
        taskId: 'job-1',
        status: 'failed',
        statusMessage: 'rate limit',
        ttl: null,
        pollInterval: 1,
        ...clock,
      },
    }))
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = await connectClient(clientTransport)
    try {
      await expect(callMcpTool(client, 'job', {}, true)).rejects.toThrow(
        /rate limit/,
      )
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('cancels the remote task when the wait is aborted', async () => {
    const { clientTransport, server, taskStore } =
      await makeServerWithPendingTaskTool()
    const client = await connectClient(clientTransport)
    const controller = new AbortController()
    const pending = callMcpTool(
      client,
      'slow_task',
      { query: 'x' },
      true,
      controller.signal,
    )
    try {
      await vi.waitFor(async () => {
        const listed = await taskStore.listTasks()
        expect(listed.tasks.length).toBeGreaterThan(0)
      })
      controller.abort()
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      await vi.waitFor(async () => {
        const listed = await taskStore.listTasks()
        expect(listed.tasks[0]?.status).toBe('cancelled')
      })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('throws MCPInputRequiredError with kind form for a user input request', async () => {
    const form = {
      message: 'Which city?',
      requestedSchema: {
        type: 'object' as const,
        properties: { city: { type: 'string' as const } },
      },
    }
    const server = modernInputServer()
    server.setRequestHandler('tools/call', () =>
      inputRequired({
        inputRequests: { city: inputRequired.elicit(form) },
      }),
    )
    const client = await connectModernClient(server)
    try {
      const execute = makeMcpExecute(client, 'ask', false)
      const error = await inputRequiredFrom(() => execute({}))
      expect(error.kind).toBe('form')
      expect(error.name).toBe('MCPInputRequiredError')
      expect(error.request).toEqual({
        mode: 'form',
        message: 'Which city?',
        requestedSchema: form.requestedSchema,
      })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('throws MCPInputRequiredError with kind sampling for a model request', async () => {
    const request = {
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: 'Hi' },
        },
      ],
      maxTokens: 16,
    }
    const server = modernInputServer()
    server.setRequestHandler('tools/call', () =>
      inputRequired({
        inputRequests: { draft: inputRequired.createMessage(request) },
      }),
    )
    const client = await connectModernClient(server)
    try {
      const execute = makeMcpExecute(client, 'draft', false)
      const error = await inputRequiredFrom(() => execute({}))
      expect(error.kind).toBe('sampling')
      expect(error.request).toEqual(request)
    } finally {
      await client.close()
      await server.close()
    }
  })

  async function answerCityWith(
    inputResponse:
      | { status: 'resolved'; payload: unknown }
      | { status: 'cancelled' },
  ) {
    const seen: Array<{ responses: unknown; state: unknown }> = []
    const server = modernInputServer()
    server.setRequestHandler('tools/call', (_request, ctx) => {
      const responses = ctx.mcpReq.inputResponses
      if (responses === undefined) {
        return inputRequired({
          inputRequests: {
            city: inputRequired.elicit({
              message: 'Which city?',
              requestedSchema: {
                type: 'object',
                properties: { city: { type: 'string' } },
              },
            }),
          },
          requestState: 'state-1',
        })
      }
      seen.push({ responses, state: ctx.mcpReq.requestState() })
      return { content: [{ type: 'text', text: 'answered' }] }
    })
    const client = await connectModernClient(server)
    try {
      const execute = makeMcpExecute(client, 'ask', false)
      const result = await execute(
        {},
        { abortSignal: undefined, inputResponse },
      )
      return { result, seen }
    } finally {
      await client.close()
      await server.close()
    }
  }

  it('sends the answer back with inputResponses and requestState', async () => {
    const { result, seen } = await answerCityWith({
      status: 'resolved',
      payload: { city: 'Paris' },
    })

    expect(result).toBe('answered')
    expect(seen).toEqual([
      {
        responses: { city: { action: 'accept', content: { city: 'Paris' } } },
        state: 'state-1',
      },
    ])
  })

  it('sends a cancel when the user cancels the form', async () => {
    const { seen } = await answerCityWith({ status: 'cancelled' })

    expect(seen[0]?.responses).toEqual({ city: { action: 'cancel' } })
  })

  it('fails with a clear error when the server asks a second input round', async () => {
    let calls = 0
    const server = modernInputServer()
    server.setRequestHandler('tools/call', () => {
      calls += 1
      return inputRequired({
        inputRequests: {
          [`round${calls}`]: inputRequired.elicit({
            message: `Question ${calls}?`,
            requestedSchema: { type: 'object', properties: {} },
          }),
        },
        requestState: `state-${calls}`,
      })
    })
    const client = await connectModernClient(server)
    try {
      const execute = makeMcpExecute(client, 'ask', false)
      // A pause here would reuse the same interrupt id and loop forever.
      await expect(
        execute(
          {},
          {
            abortSignal: undefined,
            inputResponse: { status: 'resolved', payload: {} },
          },
        ),
      ).rejects.toThrow('asked for input a second time')
      expect(calls).toBe(2)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('stops a spec 2025 task that needs input instead of polling forever', async () => {
    const clock = taskClock()
    const server = new Server(
      { name: 'job', version: '1.0.0' },
      {
        capabilities: {
          tools: {},
          tasks: { requests: { tools: { call: {} } } },
        },
      },
    )
    server.setRequestHandler('tools/call', () => ({
      content: [],
      task: {
        taskId: 'job-1',
        status: 'input_required',
        ttl: null,
        pollInterval: 1,
        ...clock,
      },
    }))
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = await connectClient(clientTransport)
    try {
      await expect(callMcpTool(client, 'job', {}, true)).rejects.toThrow(
        /needs input/,
      )
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('keeps the JSON-RPC error code on a spec 2026 call', async () => {
    const server = modernInputServer()
    server.setRequestHandler('tools/call', () => {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Unknown tool')
    })
    const client = await connectModernClient(server)
    try {
      await expect(
        callMcpTool(client, 'nope', {}, false),
      ).rejects.toMatchObject({
        code: ProtocolErrorCode.InvalidParams,
        message: 'Unknown tool',
      })
    } finally {
      await client.close()
      await server.close()
    }
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
    const client = fakeMcpClient(callTool)
    const controller = new AbortController()
    const execute = makeMcpExecute(client, 'x', false)
    await expect(execute({}, { abortSignal: controller.signal })).resolves.toBe(
      'ok',
    )
    expect(callTool).toHaveBeenCalledWith(
      { name: 'x', arguments: {} },
      { signal: controller.signal, allowInputRequired: true },
    )
  })

  it('rejects without calling the server when the signal is already aborted', async () => {
    const callTool = vi.fn()
    const client = fakeMcpClient(callTool)
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
    const client = fakeMcpClient(callTool)
    const execute = makeMcpExecute(client, 'x', true)
    await expect(execute({})).resolves.toEqual({ temperature: 72 })
  })

  it('falls back to content[] when preferStructured is false', async () => {
    const callTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'plain' }],
      structuredContent: { ignored: true },
    })
    const client = fakeMcpClient(callTool)
    const execute = makeMcpExecute(client, 'x', false)
    await expect(execute({})).resolves.toBe('plain')
  })
})

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
    // `toServerTools` returns `McpServerTool`s, so `metadata.mcp` reads
    // straight through — no annotation, no non-null assertion, no cast.
    const mcp = tool.metadata.mcp
    expect(mcp.uiResourceUri).toBeUndefined()
    expect(mcp.serverId).toBeUndefined()
  })
})

describe('toServerTools — annotations + title', () => {
  it('forwards the server annotations verbatim', () => {
    const annotations = {
      title: 'Weather Lookup',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    }
    const tool = toServerTools(
      fakeMcpClient(vi.fn()),
      [mcpToolDef({ name: 'get_weather', description: 'w', annotations })],
      {},
    )[0]!
    expect(tool.metadata.mcp.annotations).toEqual(annotations)
  })

  it('omits annotations entirely when the server declares none', () => {
    const tool = toServerTools(
      fakeMcpClient(vi.fn()),
      [mcpToolDef({ name: 'get_weather' })],
      {},
    )[0]!
    // `toServerTools` returns `McpServerTool`s, so `metadata.mcp` reads
    // straight through — no annotation, no non-null assertion, no cast.
    const mcp = tool.metadata.mcp
    expect(mcp.annotations).toBeUndefined()
    // Omitted, not present-with-undefined — the explicit tools(defs) path
    // merges this block over caller-supplied metadata.
    expect('annotations' in mcp).toBe(false)
  })

  it('resolves title with MCP precedence: title > annotations.title > name', () => {
    const [both, annotationsOnly, neither] = toServerTools(
      fakeMcpClient(vi.fn()),
      [
        mcpToolDef({
          name: 'a',
          title: 'Top Level',
          annotations: { title: 'Legacy' },
        }),
        mcpToolDef({ name: 'b', annotations: { title: 'Legacy' } }),
        mcpToolDef({ name: 'c' }),
      ],
      {},
    )
    expect(both!.metadata.mcp.title).toBe('Top Level')
    expect(annotationsOnly!.metadata.mcp.title).toBe('Legacy')
    expect(neither!.metadata.mcp.title).toBe('c')
  })

  it('keeps the prefixed tool name independent of the display title', () => {
    const tool = toServerTools(
      fakeMcpClient(vi.fn()),
      [mcpToolDef({ name: 'get_weather', title: 'Weather Lookup' })],
      { prefix: 'wx' },
    )[0]!
    // The title is display-only — it must never leak into the model-facing name.
    expect(tool.name).toBe('wx_get_weather')
    expect(tool.metadata.mcp.title).toBe('Weather Lookup')
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

type RawMessage = { id: string; params: Record<string, unknown> }

/**
 * A spec 2026 client whose transport answers each raw request at once with
 * the messages `reply` returns. Like `fakeMcpClient`, the partial needs the
 * `unknown` bridge.
 */
function scriptedModernClient(
  reply: (message: RawMessage) => Array<unknown>,
  extra: Record<string, unknown> = {},
) {
  const sent: Array<RawMessage> = []
  const transport: {
    onmessage?: (message: unknown) => void
    send: (message: RawMessage) => Promise<void>
  } = {
    async send(message) {
      sent.push(message)
      for (const answer of reply(message)) transport.onmessage?.(answer)
      if (extra.sendError instanceof Error) throw extra.sendError
    },
  }
  const client = {
    getProtocolEra: () => 'modern',
    transport,
    ...extra,
  } as unknown as Client
  return { client, sent }
}

function answerWith(result: unknown) {
  return (message: RawMessage) => [{ jsonrpc: '2.0', id: message.id, result }]
}

/** A spec 2025 client. Each SDK request is answered by `answers[method]`. */
function scriptedLegacyClient(
  answers: Record<string, (signal?: AbortSignal) => unknown>,
) {
  return {
    getProtocolEra: () => 'legacy',
    async request(
      rpc: { method: string },
      _schema: unknown,
      options?: { signal?: AbortSignal },
    ) {
      const answer = answers[rpc.method]
      if (answer === undefined) throw new Error(`No answer for ${rpc.method}`)
      return answer(options?.signal)
    },
  } as unknown as Client
}

const okResult = { content: [{ type: 'text', text: 'ok' }] }
const missingResult = 'ended without a result or error'

describe('callMcpTool — spec 2026 raw requests', () => {
  it('fails when the reply has no tool result, and sends the envelope', async () => {
    const { client, sent } = scriptedModernClient(answerWith(null), {
      _outboundMetaEnvelope: () => ({ version: '2026-07-28' }),
    })

    await expect(callMcpTool(client, 'ask', {}, false)).rejects.toThrow(
      missingResult,
    )
    expect(sent[0]?.params._meta).toEqual({ version: '2026-07-28' })
  })

  it('sends no envelope when the client gives none', async () => {
    for (const extra of [{}, { _outboundMetaEnvelope: () => 'x' }]) {
      const { client, sent } = scriptedModernClient(answerWith(okResult), extra)
      await expect(callMcpTool(client, 'ask', {}, false)).resolves.toEqual(
        okResult,
      )
      expect(sent[0]?.params._meta).toBeUndefined()
    }
  })

  it('uses defaults for a JSON-RPC error without code or message', async () => {
    const { client } = scriptedModernClient((message) => [
      { jsonrpc: '2.0', id: message.id, error: {} },
    ])

    await expect(callMcpTool(client, 'ask', {}, false)).rejects.toMatchObject({
      code: ProtocolErrorCode.InternalError,
      message: 'The MCP request failed.',
    })
  })

  it('ignores messages for other requests', async () => {
    const { client } = scriptedModernClient((message) => [
      { jsonrpc: '2.0', id: 'other', result: {} },
      { jsonrpc: '2.0', id: message.id, result: okResult },
    ])

    await expect(callMcpTool(client, 'ask', {}, false)).resolves.toEqual(
      okResult,
    )
  })

  it('keeps the answer when send fails after it, and fails without one', async () => {
    const sendError = new Error('send failed')
    const answered = scriptedModernClient(answerWith(okResult), { sendError })
    await expect(
      callMcpTool(answered.client, 'ask', {}, false),
    ).resolves.toEqual(okResult)

    const silent = scriptedModernClient(() => [], { sendError })
    await expect(callMcpTool(silent.client, 'ask', {}, false)).rejects.toBe(
      sendError,
    )
  })

  it('fails when the client has no transport', async () => {
    const client = { getProtocolEra: () => 'modern' } as unknown as Client

    await expect(callMcpTool(client, 'ask', {}, false)).rejects.toThrow(
      'The MCP client is not connected.',
    )
  })

  it('stops on abort and resolves with a signal that never fires', async () => {
    const answered = scriptedModernClient(answerWith(okResult))
    await expect(
      callMcpTool(
        answered.client,
        'ask',
        {},
        false,
        new AbortController().signal,
      ),
    ).resolves.toEqual(okResult)

    const silent = scriptedModernClient(() => [])
    const controller = new AbortController()
    const pending = callMcpTool(
      silent.client,
      'ask',
      {},
      false,
      controller.signal,
    )
    controller.abort(new Error('stop'))
    await expect(pending).rejects.toThrow('stop')
  })

  it('times out when the reply never comes', async () => {
    vi.useFakeTimers()
    try {
      const { client } = scriptedModernClient(() => [])
      const pending = expect(
        callMcpTool(client, 'ask', {}, false),
      ).rejects.toThrow(/timed out/)
      await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MSEC)
      await pending
    } finally {
      vi.useRealTimers()
    }
  })

  it('reads every input request shape', async () => {
    const call = (result: unknown) =>
      callMcpTool(
        scriptedModernClient(answerWith(result)).client,
        'ask',
        {},
        false,
      )

    await expect(
      call({
        resultType: 'input_required',
        inputRequests: { a: { method: 'roots/list', params: {} } },
      }),
    ).rejects.toThrow('unsupported input: roots/list')

    const noRecord = { resultType: 'input_required', inputRequests: 'x' }
    const fallback = await inputRequiredFrom(() => call(noRecord))
    expect(fallback.request).toEqual(noRecord)

    const bare = { method: 'elicitation/create', message: 'City?' }
    const flat = await inputRequiredFrom(() =>
      call({ status: 'input_required', inputRequests: { a: 1, b: bare } }),
    )
    expect(flat.kind).toBe('form')
    expect(flat.request).toEqual(bare)

    const invalid = { status: 'input_required', inputRequests: { a: 1 } }
    expect((await inputRequiredFrom(() => call(invalid))).request).toEqual(
      invalid,
    )

    await expect(
      call({ status: 'input_required', inputRequests: {} }),
    ).rejects.toThrow(missingResult)
  })

  async function retrySent(
    inputRequests: Record<string, unknown> | undefined,
    inputResponse: Parameters<typeof callMcpTool>[5],
    requestState?: string,
  ) {
    const { client, sent } = scriptedModernClient((message) => [
      {
        jsonrpc: '2.0',
        id: message.id,
        result:
          sent.length === 1
            ? { resultType: 'input_required', inputRequests, requestState }
            : okResult,
      },
    ])
    await callMcpTool(client, 'draft', {}, false, undefined, inputResponse)
    return sent[1]?.params
  }

  it('answers a sampling request with text, a result object, or a cancel', async () => {
    const sampling = { draft: { method: 'sampling/createMessage', params: {} } }

    expect(
      await retrySent(sampling, { status: 'resolved', payload: 'Sunny' }, 's1'),
    ).toMatchObject({
      requestState: 's1',
      inputResponses: {
        draft: {
          role: 'assistant',
          content: { type: 'text', text: 'Sunny' },
          model: 'user',
        },
      },
    })

    const custom = { role: 'assistant', content: { type: 'text', text: 'x' } }
    expect(
      (await retrySent(sampling, { status: 'resolved', payload: custom }))
        ?.inputResponses,
    ).toEqual({ draft: custom })

    await expect(retrySent(sampling, { status: 'cancelled' })).rejects.toThrow(
      'The user cancelled the MCP sampling request.',
    )
  })

  it('passes an ElicitResult as is and retries without requests', async () => {
    const form = { city: { method: 'elicitation/create', params: {} } }
    expect(
      (
        await retrySent(form, {
          status: 'resolved',
          payload: { action: 'decline' },
        })
      )?.inputResponses,
    ).toEqual({ city: { action: 'decline' } })

    const params = await retrySent(
      undefined,
      { status: 'resolved', payload: 'x' },
      's1',
    )
    expect(params).toEqual({ name: 'draft', arguments: {}, requestState: 's1' })
  })
})

describe('callMcpTool — spec 2025 task replies', () => {
  const working = (pollInterval: number) => () => ({
    task: { taskId: 't', status: 'working', pollInterval },
  })
  const completed = () => ({ taskId: 't', status: 'completed' })

  it('throws MCPInputRequiredError when tasks/get asks for input', async () => {
    const client = scriptedLegacyClient({
      'tools/call': working(0),
      'tasks/get': () => ({
        status: 'input_required',
        inputRequests: {
          a: { method: 'elicitation/create', params: { message: 'City?' } },
        },
      }),
    })

    const error = await inputRequiredFrom(() =>
      callMcpTool(client, 'job', {}, true),
    )
    expect(error.request).toEqual({ message: 'City?' })
  })

  it('fails on a task body it cannot read', async () => {
    for (const body of [{}, { taskId: 't', status: 'weird' }]) {
      const client = scriptedLegacyClient({
        'tools/call': working(0),
        'tasks/get': () => body,
      })
      await expect(callMcpTool(client, 'job', {}, true)).rejects.toThrow(
        missingResult,
      )
    }
  })

  it('fails when tools/call or tasks/result has no tool result', async () => {
    const noTask = scriptedLegacyClient({ 'tools/call': () => ({}) })
    await expect(callMcpTool(noTask, 'job', {}, true)).rejects.toThrow(
      missingResult,
    )

    const noResult = scriptedLegacyClient({
      'tools/call': working(0),
      'tasks/get': completed,
      'tasks/result': () => ({}),
    })
    await expect(callMcpTool(noResult, 'job', {}, true)).rejects.toThrow(
      missingResult,
    )
  })

  it('names a failed task without a status message', async () => {
    const client = scriptedLegacyClient({
      'tools/call': () => ({ task: { taskId: 't', status: 'failed' } }),
    })

    await expect(callMcpTool(client, 'job', {}, true)).rejects.toThrow(
      'MCP task "t" failed.',
    )
  })

  it('waits the poll interval without a signal', async () => {
    const client = scriptedLegacyClient({
      'tools/call': working(1),
      'tasks/get': completed,
      'tasks/result': () => okResult,
    })

    await expect(callMcpTool(client, 'job', {}, true)).resolves.toEqual(
      okResult,
    )
  })

  it('throws the abort reason when the request fails after an abort', async () => {
    const controller = new AbortController()
    const client = scriptedLegacyClient({
      'tools/call': (signal) =>
        new Promise((_, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new Error('socket closed')),
          )
        }),
    })
    const pending = callMcpTool(client, 'job', {}, true, controller.signal)
    controller.abort(new Error('stop'))

    await expect(pending).rejects.toThrow('stop')
  })
})

describe('extractUiResourceUri', () => {
  it('returns undefined when _meta.ui is not an object', () => {
    expect(
      extractUiResourceUri({
        ...mcpToolDef({ name: 'a' }),
        _meta: { ui: 'x' },
      }),
    ).toBeUndefined()
  })
})
