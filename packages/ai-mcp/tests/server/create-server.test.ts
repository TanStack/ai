import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server'
import type { OAuthTokenVerifier } from '@modelcontextprotocol/server'
import { toolDefinition } from '@tanstack/ai'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  promptDefinition,
  resourceDefinition,
} from '../../src/server/definitions'
import { createMCPServer } from '../../src/server/create-server'
import type { MCPHandleOptions } from '../../src/server/create-server'
import type { MCPToolContext, SampleRequest } from '../../src/server/context'
import { inMemoryTaskStore } from '../../src/server/stores'
import { MCPInputRequiredError } from '../../src/input-required'
import { callMcpTool } from '../../src/tools'

const serverUrl = new URL('https://mcp.example.com/mcp')
const resourceMetadataUrl =
  'https://mcp.example.com/.well-known/oauth-protected-resource/mcp'

const summaryRequest: SampleRequest = {
  messages: [{ role: 'user', content: 'Draft a summary' }],
}

// Spec 2025-11-25 task shapes.
const taskShape = z.looseObject({
  taskId: z.string(),
  status: z.string(),
  ttl: z.null(),
})
const createTaskResult = z.looseObject({ task: taskShape })
const callToolResult = z.looseObject({
  content: z.array(z.looseObject({ type: z.string() })),
})

function taskCall(client: Client, name: string) {
  return client.request(
    { method: 'tools/call', params: { name, arguments: {}, task: {} } },
    createTaskResult,
  )
}

function taskGet(client: Client, taskId: string) {
  return client.request({ method: 'tasks/get', params: { taskId } }, taskShape)
}

function taskResultOf(client: Client, taskId: string) {
  return client.request(
    { method: 'tasks/result', params: { taskId } },
    callToolResult,
  )
}

function echoTool() {
  return toolDefinition({
    name: 'echo',
    description: 'Echo text',
    inputSchema: z.object({ text: z.string() }),
  }).server(async (args) => args.text)
}

function readmeResource() {
  return resourceDefinition({
    uri: 'file:///readme.md',
    name: 'readme',
    mimeType: 'text/markdown',
  }).read(async () => ({ text: 'hello' }))
}

function summarizePrompt() {
  return promptDefinition({
    name: 'summarize',
    description: 'Summarize a topic',
    argsSchema: z.object({ topic: z.string() }),
  }).render(async (args) => [{ role: 'user', content: args.topic }])
}

// Keeps spec 2025 sessions, so the session tests can use it.
function surfaceServer() {
  return createMCPServer({
    name: 'weather',
    version: '1.0.0',
    sessions: 'memory',
    tools: [echoTool()],
    resources: [readmeResource()],
    prompts: [summarizePrompt()],
  })
}

// The SDK verifier shape. Each token is its own subject on one client.
// `accept` limits the verifier to one token.
function tokenVerifier(accept?: string): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token) {
      if (accept !== undefined && token !== accept) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown token')
      }
      return {
        token,
        clientId: 'tester',
        scopes: ['mcp'],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        extra: { sub: token },
      }
    },
  }
}

const subjectAuth = { verifier: tokenVerifier() }

function initializeRequest(token: string) {
  return new Request(serverUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'raw', version: '1.0.0' },
      },
    }),
  })
}

function sessionRequest(token: string, sessionId: string) {
  return new Request(serverUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-session-id': sessionId,
      'mcp-protocol-version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  })
}

// A spec 2026 tools/list request, with or without a bearer token.
function mcpRequest(token: string | undefined) {
  return new Request(serverUrl, {
    method: 'POST',
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
}

async function openSession(
  server: { fetch(request: Request): Promise<Response> },
  token: string,
) {
  const opened = await server.fetch(initializeRequest(token))
  const sessionId = opened.headers.get('mcp-session-id')
  if (sessionId === null) throw new Error('The server opened no session')
  return sessionId
}

function deferredText() {
  const box: { resolve?: (value: { text: string }) => void } = {}
  const work = new Promise<{ text: string }>((resolve) => {
    box.resolve = resolve
  })
  const resolve = box.resolve
  if (resolve === undefined) {
    throw new Error('The deferred work has no resolve')
  }
  return { work, resolve }
}

async function withClient(
  server: {
    fetch(request: Request): Promise<Response>
    handle(request: Request, options?: MCPHandleOptions): Promise<Response>
  },
  hooks: {
    era: '2025' | '2026'
    authToken?: string
    handleOptions?: MCPHandleOptions
    onResponse?: (text: string) => void
    prepare?: (client: Client) => void
  },
  run: (
    client: Client,
    transport: StreamableHTTPClientTransport,
  ) => Promise<void>,
) {
  const versionNegotiation =
    hooks.era === '2026' ? { mode: { pin: '2026-07-28' } } : undefined
  const client = new Client(
    { name: 'tester', version: '1.0.0' },
    {
      versionNegotiation,
      capabilities: { elicitation: { form: {} }, sampling: {} },
    },
  )
  hooks.prepare?.(client)
  const transport = new StreamableHTTPClientTransport(serverUrl, {
    authProvider:
      hooks.authToken === undefined
        ? undefined
        : { token: async () => hooks.authToken },
    fetch: async (input, init) => {
      const request = new Request(input, init)
      const response =
        hooks.handleOptions === undefined
          ? await server.fetch(request)
          : await server.handle(request, hooks.handleOptions)
      if (hooks.onResponse !== undefined) {
        hooks.onResponse(await response.clone().text())
      }
      return response
    },
  })
  await client.connect(transport)
  try {
    await run(client, transport)
  } finally {
    await client.close()
  }
}

describe('createMCPServer', () => {
  it('lists and calls a tool for a spec 2026 request', async () => {
    const server = surfaceServer()

    await withClient(server, { era: '2026' }, async (client) => {
      const listed = await client.listTools()
      expect(listed.tools.map((tool) => tool.name)).toEqual(['echo'])

      const echoed = await client.callTool({
        name: 'echo',
        arguments: { text: 'hi' },
      })
      expect(echoed.content).toEqual([{ type: 'text', text: 'hi' }])

      const resources = await client.listResources()
      expect(resources.resources.map((resource) => resource.name)).toEqual([
        'readme',
      ])
      const readme = await client.readResource({ uri: 'file:///readme.md' })
      expect(readme.contents).toEqual([
        { uri: 'file:///readme.md', mimeType: 'text/markdown', text: 'hello' },
      ])

      const prompts = await client.listPrompts()
      expect(prompts.prompts.map((prompt) => prompt.name)).toEqual([
        'summarize',
      ])
      const summary = await client.getPrompt({
        name: 'summarize',
        arguments: { topic: 'weather' },
      })
      expect(summary.messages).toEqual([
        { role: 'user', content: { type: 'text', text: 'weather' } },
      ])
    })
  })

  it('lists and calls a tool for a spec 2025 session', async () => {
    const server = surfaceServer()

    await withClient(server, { era: '2025' }, async (client, transport) => {
      expect(transport.sessionId).toEqual(expect.any(String))

      const listed = await client.listTools()
      expect(listed.tools.map((tool) => tool.name)).toEqual(['echo'])

      const echoed = await client.callTool({
        name: 'echo',
        arguments: { text: 'hi' },
      })
      expect(echoed.content).toEqual([{ type: 'text', text: 'hi' }])
    })
  })

  it('returns a spec 2025 task handle before the task tool finishes', async () => {
    const taskStore = inMemoryTaskStore()
    const gate = deferredText()
    let finished = false
    const calls: Array<Promise<unknown>> = []
    const server = createMCPServer({
      name: 'tasks',
      version: '1.0.0',
      taskStore,
      waitUntil(promise) {
        calls.push(promise)
      },
      tools: [
        toolDefinition({
          name: 'slow',
          description: 'Slow work',
          execution: 'task',
        }).server(async () => {
          const result = await gate.work
          finished = true
          return result
        }),
      ],
    })

    await withClient(server, { era: '2025' }, async (client) => {
      expect(client.getServerCapabilities()?.tasks).toEqual({
        requests: { tools: { call: {} } },
      })
      const listed = await client.listTools()
      expect(listed.tools[0]?.execution).toEqual({ taskSupport: 'required' })

      // Spec 2025-11-25 CreateTaskResult: the task rides under `task`.
      const created = await taskCall(client, 'slow')
      expect(finished).toBe(false)
      expect(created.task).toMatchObject({ status: 'working', ttl: null })
      const taskId = created.task.taskId
      expect(taskId.length).toBeGreaterThan(0)
      expect(await taskStore.get(taskId)).toEqual({
        taskId,
        status: 'working',
        ttl: null,
        createdAt: expect.any(String),
        lastUpdatedAt: expect.any(String),
      })

      const inflight = calls[0]
      if (inflight === undefined) {
        throw new Error('waitUntil did not receive a promise')
      }
      gate.resolve({ text: 'done' })
      await inflight
      expect(finished).toBe(true)

      expect(await taskGet(client, taskId)).toMatchObject({
        taskId,
        status: 'completed',
        ttl: null,
      })
      expect(await taskResultOf(client, taskId)).toEqual({
        content: [{ type: 'text', text: '{"text":"done"}' }],
        structuredContent: { text: 'done' },
      })
    })
  })

  it('runs a task tool inline for a spec 2026 request', async () => {
    // Spec 2026-07-28 has no tasks. The call waits for the tool output.
    const taskStore = inMemoryTaskStore()
    const server = createMCPServer({
      name: 'tasks',
      version: '1.0.0',
      taskStore,
      tools: [
        toolDefinition({
          name: 'slow',
          description: 'Slow work',
          execution: 'task',
        }).server(async () => 'done'),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const listed = await client.listTools()
      expect(listed.tools[0]?.execution).toBeUndefined()
      const called = await client.callTool({ name: 'slow', arguments: {} })
      expect(called.content).toEqual([{ type: 'text', text: 'done' }])
    })
  })

  it('ends the call when the user cancels a spec 2026 input request', async () => {
    const server = createMCPServer({
      name: 'weather',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'ask',
          description: 'Ask for a city',
          inputSchema: z.object({}),
        }).server<MCPToolContext>(async (_args, ctx) => {
          const city = await ctx.context.requestInput({
            message: 'Which city?',
          })
          return `Forecast for ${String(city)}`
        }),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      await expect(
        callMcpTool(client, 'ask', {}, false),
      ).rejects.toBeInstanceOf(MCPInputRequiredError)

      // A cancel must not ask again. The tool ends with a tool error.
      const cancelled = await callMcpTool(client, 'ask', {}, false, undefined, {
        status: 'cancelled',
      })
      expect(cancelled.isError).toBe(true)
      expect(JSON.stringify(cancelled.content)).toContain(
        'The user did not accept the input request.',
      )

      const answered = await callMcpTool(client, 'ask', {}, false, undefined, {
        status: 'resolved',
        payload: { value: 'Paris' },
      })
      expect(answered.content).toEqual([
        { type: 'text', text: 'Forecast for Paris' },
      ])
    })
  })

  it('rejects a missing or bad bearer token with a spec 401', async () => {
    const server = createMCPServer({
      name: 'secure',
      version: '1.0.0',
      auth: { verifier: tokenVerifier('secret'), resourceMetadataUrl },
      tools: [echoTool()],
    })

    const missing = await server.fetch(mcpRequest(undefined))
    expect(missing.status).toBe(401)
    const challenge = missing.headers.get('WWW-Authenticate') ?? ''
    expect(challenge).toContain('Bearer')
    // RFC 9728: the challenge names the protected resource metadata.
    expect(challenge).toContain(`resource_metadata="${resourceMetadataUrl}"`)

    const bad = await server.fetch(mcpRequest('nope'))
    expect(bad.status).toBe(401)
    expect(bad.headers.get('WWW-Authenticate')).toContain('invalid_token')

    await withClient(
      server,
      { era: '2026', authToken: 'secret' },
      async (client) => {
        const listed = await client.listTools()
        expect(listed.tools.map((tool) => tool.name)).toEqual(['echo'])
      },
    )
  })

  it('rejects a token without a required scope with 403', async () => {
    const server = createMCPServer({
      name: 'secure',
      version: '1.0.0',
      auth: { verifier: tokenVerifier(), requiredScopes: ['admin'] },
      tools: [echoTool()],
    })

    const denied = await server.fetch(mcpRequest('alice'))
    expect(denied.status).toBe(403)
    expect(denied.headers.get('WWW-Authenticate')).toContain(
      'insufficient_scope',
    )
  })

  it('gives a tool the verified token as ctx.context.authInfo', async () => {
    const server = createMCPServer({
      name: 'secure',
      version: '1.0.0',
      auth: subjectAuth,
      tools: [
        toolDefinition({
          name: 'whoami',
          description: 'Who is calling',
          inputSchema: z.object({}),
        }).server<MCPToolContext>(async (_args, ctx) => {
          const info = ctx.context.authInfo
          if (info === undefined) return 'nobody'
          return `${info.clientId}:${String(info.extra?.sub)}`
        }),
      ],
    })

    for (const era of ['2026', '2025'] as const) {
      await withClient(server, { era, authToken: 'alice' }, async (client) => {
        const called = await client.callTool({ name: 'whoami', arguments: {} })
        expect(called.content).toEqual([{ type: 'text', text: 'tester:alice' }])
      })
    }
  })

  it('takes a verified token and a context from handle options', async () => {
    const server = createMCPServer({
      name: 'secure',
      version: '1.0.0',
      // The verifier accepts no token, so only handle options can let a call in.
      auth: { verifier: tokenVerifier('never') },
      tools: [
        toolDefinition({
          name: 'whoami',
          description: 'Who is calling, and from which tenant',
          inputSchema: z.object({}),
        }).server<MCPToolContext<{ tenant: string }>>(async (_args, ctx) => {
          return `${String(ctx.context.authInfo?.extra?.sub)}@${ctx.context.tenant}`
        }),
      ],
    })
    const authInfo = {
      token: 'from-middleware',
      clientId: 'app',
      scopes: [],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      extra: { sub: 'carol' },
    }

    const gated = await server.fetch(mcpRequest(undefined))
    expect(gated.status).toBe(401)

    for (const era of ['2026', '2025'] as const) {
      await withClient(
        server,
        { era, handleOptions: { authInfo, context: { tenant: 'acme' } } },
        async (client) => {
          const called = await client.callTool({
            name: 'whoami',
            arguments: {},
          })
          expect(called.content).toEqual([{ type: 'text', text: 'carol@acme' }])
        },
      )
    }
  })

  it('keeps its own hooks over a same-named value in the context', async () => {
    const server = createMCPServer({
      name: 'plain',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'probe',
          description: 'Reports whether requestInput is still a function',
          inputSchema: z.object({}),
        }).server<MCPToolContext>(async (_args, ctx) => {
          return typeof ctx.context.requestInput
        }),
      ],
    })

    await withClient(
      server,
      { era: '2026', handleOptions: { context: { requestInput: 'shadowed' } } },
      async (client) => {
        const called = await client.callTool({ name: 'probe', arguments: {} })
        expect(called.content).toEqual([{ type: 'text', text: 'function' }])
      },
    )
  })

  it('sends tool title and annotations from metadata to the host', async () => {
    const server = createMCPServer({
      name: 'library',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'list_notes',
          description: 'List notes',
          inputSchema: z.object({}),
          metadata: {
            title: 'List notes',
            annotations: { readOnlyHint: true, openWorldHint: false },
          },
        }).server(async () => []),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const listed = await client.listTools()
      expect(listed.tools[0]?.title).toBe('List notes')
      expect(listed.tools[0]?.annotations).toEqual({
        readOnlyHint: true,
        openWorldHint: false,
      })
    })
  })

  it('sends a CallToolResult from a tool as is', async () => {
    const server = createMCPServer({
      name: 'library',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'shaped',
          description: 'Builds its own result',
          inputSchema: z.object({}),
        }).server(async () => ({
          content: [
            { type: 'text' as const, text: 'Two notes.' },
            { type: 'text' as const, text: '{"count":2}' },
          ],
          structuredContent: { count: 2 },
        })),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const called = await client.callTool({ name: 'shaped', arguments: {} })
      expect(called.content).toEqual([
        { type: 'text', text: 'Two notes.' },
        { type: 'text', text: '{"count":2}' },
      ])
      expect(called.structuredContent).toEqual({ count: 2 })
    })
  })

  it('rejects a spec 2025 request when sessions is reject', async () => {
    const server = createMCPServer({
      name: 'stateless',
      version: '1.0.0',
      sessions: 'reject',
      tools: [echoTool()],
    })

    const opened = await server.fetch(initializeRequest('any'))
    expect(opened.ok).toBe(false)
    expect(opened.headers.get('mcp-session-id')).toBeNull()

    await withClient(server, { era: '2026' }, async (client) => {
      const listed = await client.listTools()
      expect(listed.tools.map((tool) => tool.name)).toEqual(['echo'])
    })
  })

  it('uses the sample adapter for a spec 2026 sample and does not ask the client', async () => {
    const seen: Array<SampleRequest> = []
    const clientAsks: Array<string> = []
    const server = createMCPServer({
      name: 'writer',
      version: '1.0.0',
      sample: async (request) => {
        seen.push(request)
        return 'from-adapter'
      },
      tools: [
        toolDefinition({
          name: 'draft',
          description: 'Draft a summary',
        }).server<MCPToolContext>(async (_args, ctx) =>
          ctx.context.sample(summaryRequest),
        ),
      ],
    })

    await withClient(
      server,
      {
        era: '2026',
        prepare(client) {
          client.setRequestHandler('sampling/createMessage', async () => {
            clientAsks.push('client')
            return {
              role: 'assistant',
              content: { type: 'text', text: 'from-client' },
              model: 'client',
            }
          })
        },
      },
      async (client) => {
        const drafted = await client.callTool({ name: 'draft', arguments: {} })
        expect(drafted.content).toEqual([
          { type: 'text', text: 'from-adapter' },
        ])
      },
    )

    expect(seen).toEqual([summaryRequest])
    expect(clientAsks).toEqual([])
  })

  it('keeps a string output schema for spec 2026 and spec 2025 clients', async () => {
    const server = createMCPServer({
      name: 'weather',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'forecast',
          description: 'Forecast text',
          inputSchema: z.object({}),
          outputSchema: z.string(),
        }).server(async () => 'Sunny'),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const listed = await client.listTools()
      expect(listed.tools[0]?.outputSchema).toMatchObject({ type: 'string' })
      const called = await client.callTool({ name: 'forecast', arguments: {} })
      expect(called.structuredContent).toBe('Sunny')
    })
    await withClient(server, { era: '2025' }, async (client) => {
      const called = await client.callTool({ name: 'forecast', arguments: {} })
      expect(called.content).toEqual([{ type: 'text', text: 'Sunny' }])
    })
  })

  it('sends a text string when a tool returns nothing', async () => {
    const server = createMCPServer({
      name: 'weather',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'noop',
          description: 'Returns nothing',
          inputSchema: z.object({}),
        }).server(async () => undefined),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const called = await client.callTool({ name: 'noop', arguments: {} })
      expect(called.content).toEqual([{ type: 'text', text: '' }])
    })
  })

  it('gives a spec 2025 session only to the subject that opened it', async () => {
    const server = createMCPServer({
      name: 'secure',
      version: '1.0.0',
      sessions: 'memory',
      auth: subjectAuth,
      tools: [echoTool()],
    })
    const sessionId = await openSession(server, 'alice')

    const own = await server.fetch(sessionRequest('alice', sessionId))
    expect(own.status).toBe(200)
    const other = await server.fetch(sessionRequest('bob', sessionId))
    expect(other.status).toBe(404)
  })

  it('closes a spec 2025 session after 30 idle minutes', async () => {
    const server = surfaceServer()
    const start = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(start)
    try {
      const opened = await server.fetch(initializeRequest('any'))
      const sessionId = opened.headers.get('mcp-session-id')
      if (sessionId === null) throw new Error('The server opened no session')

      now.mockReturnValue(start + 31 * 60 * 1000)
      const late = await server.fetch(sessionRequest('any', sessionId))
      expect(late.status).toBe(404)
    } finally {
      now.mockRestore()
    }
  })

  it('shows a task only to the subject that started it', async () => {
    const server = createMCPServer({
      name: 'tasks',
      version: '1.0.0',
      auth: subjectAuth,
      taskStore: inMemoryTaskStore(),
      tools: [
        toolDefinition({
          name: 'slow',
          description: 'Slow work',
          execution: 'task',
        }).server(async () => 'done'),
      ],
    })

    let taskId = ''
    await withClient(
      server,
      { era: '2025', authToken: 'alice' },
      async (client) => {
        const created = await taskCall(client, 'slow')
        taskId = created.task.taskId
        await vi.waitFor(async () => {
          expect((await taskGet(client, taskId)).status).toBe('completed')
        })
        expect((await taskResultOf(client, taskId)).content).toEqual([
          { type: 'text', text: 'done' },
        ])
      },
    )

    await withClient(
      server,
      { era: '2025', authToken: 'bob' },
      async (client) => {
        await expect(taskGet(client, taskId)).rejects.toThrow('Task not found')
      },
    )
  })

  it('gives a task tool its own context, not the finished request', async () => {
    const seen: Array<{ aborted: boolean; message: string }> = []
    const calls: Array<Promise<unknown>> = []
    const server = createMCPServer({
      name: 'tasks',
      version: '1.0.0',
      taskStore: inMemoryTaskStore(),
      waitUntil(promise) {
        calls.push(promise)
      },
      tools: [
        toolDefinition({
          name: 'ask',
          description: 'Asks in a task',
          execution: 'task',
        }).server<MCPToolContext>(async (_args, ctx) => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          const aborted = ctx.abortSignal?.aborted ?? true
          try {
            await ctx.context.requestInput({ message: 'City?' })
          } catch (error) {
            seen.push({
              aborted,
              message: error instanceof Error ? error.message : '',
            })
          }
          return 'done'
        }),
      ],
    })

    await withClient(server, { era: '2025' }, async (client) => {
      await taskCall(client, 'ask')
    })
    await Promise.all(calls)

    expect(seen).toEqual([
      {
        aborted: false,
        message:
          'ctx.context.requestInput is not supported in an execution: "task" tool.',
      },
    ])
  })

  it('asks a spec 2025 client for input and a sample in the same call', async () => {
    const samples: Array<unknown> = []
    const server = createMCPServer({
      name: 'writer',
      version: '1.0.0',
      sessions: 'memory',
      tools: [
        toolDefinition({
          name: 'draft',
          description: 'Draft for a city',
          inputSchema: z.object({}),
        }).server<MCPToolContext>(async (_args, ctx) => {
          ctx.emitCustomEvent('progress', {})
          const city = await ctx.context.requestInput({ message: 'City?' })
          const draft = await ctx.context.sample({
            messages: [
              { role: 'user', content: `Draft for ${String(city)}` },
              { role: 'assistant', content: 'Sure' },
            ],
          })
          return `${String(city)}: ${draft}`
        }),
      ],
    })

    await withClient(
      server,
      {
        era: '2025',
        prepare(client) {
          client.setRequestHandler('elicitation/create', async () => ({
            action: 'accept',
            content: { value: 'Paris' },
          }))
          client.setRequestHandler('sampling/createMessage', async (req) => {
            samples.push(req.params.messages)
            return {
              role: 'assistant',
              content: { type: 'text', text: 'Sunny' },
              model: 'client',
            }
          })
        },
      },
      async (client) => {
        const called = await client.callTool({ name: 'draft', arguments: {} })
        expect(called.content).toEqual([{ type: 'text', text: 'Paris: Sunny' }])
      },
    )

    expect(samples).toEqual([
      [
        { role: 'user', content: { type: 'text', text: 'Draft for Paris' } },
        { role: 'assistant', content: { type: 'text', text: 'Sure' } },
      ],
    ])
  })

  it('handles spec 2025 declines, empty answers, and text-less samples', async () => {
    let answer: { action: 'accept' | 'decline' } = { action: 'decline' }
    const server = createMCPServer({
      name: 'writer',
      version: '1.0.0',
      sessions: 'memory',
      tools: [
        toolDefinition({
          name: 'ask',
          description: 'Ask',
          inputSchema: z.object({}),
        }).server<MCPToolContext>(async (_args, ctx) =>
          JSON.stringify(await ctx.context.requestInput({ message: 'City?' })),
        ),
        toolDefinition({
          name: 'draft',
          description: 'Draft',
          inputSchema: z.object({}),
        }).server<MCPToolContext>(async (_args, ctx) =>
          ctx.context.sample(summaryRequest),
        ),
      ],
    })

    await withClient(
      server,
      {
        era: '2025',
        prepare(client) {
          client.setRequestHandler('elicitation/create', async () => answer)
          client.setRequestHandler('sampling/createMessage', async () => ({
            role: 'assistant',
            content: { type: 'image', data: 'AAAA', mimeType: 'image/png' },
            model: 'client',
          }))
        },
      },
      async (client) => {
        const declined = await client.callTool({ name: 'ask', arguments: {} })
        expect(declined.isError).toBe(true)
        expect(JSON.stringify(declined.content)).toContain(
          'The user did not accept the input request.',
        )

        answer = { action: 'accept' }
        const empty = await client.callTool({ name: 'ask', arguments: {} })
        expect(empty.isError).toBe(true)

        const drafted = await client.callTool({ name: 'draft', arguments: {} })
        expect(drafted.isError).toBe(true)
        expect(JSON.stringify(drafted.content)).toContain(
          'The client sample result has no text.',
        )
      },
    )
  })

  it('gives a spec 2026 tool a non-string answer as the answer object', async () => {
    const server = createMCPServer({
      name: 'weather',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'ask',
          description: 'Ask',
          inputSchema: z.object({}),
        }).server<MCPToolContext>(async (_args, ctx) =>
          JSON.stringify(await ctx.context.requestInput({ message: 'City?' })),
        ),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const answered = await callMcpTool(client, 'ask', {}, false, undefined, {
        status: 'resolved',
        payload: { value: 3 },
      })
      expect(answered.content).toEqual([{ type: 'text', text: '{"value":3}' }])
    })
  })

  it('lets a task tool sample only with the sample option', async () => {
    const results: Array<unknown> = []
    const calls: Array<Promise<unknown>> = []
    const draftTool = toolDefinition({
      name: 'draft',
      description: 'Draft in a task',
      execution: 'task',
    }).server<MCPToolContext>(async (_args, ctx) => {
      ctx.emitCustomEvent('progress', {})
      try {
        results.push(await ctx.context.sample(summaryRequest))
      } catch (error) {
        results.push(error instanceof Error ? error.message : '')
      }
      return 'done'
    })
    for (const sample of [undefined, async () => 'from-adapter']) {
      const server = createMCPServer({
        name: 'tasks',
        version: '1.0.0',
        sample,
        waitUntil: (promise) => calls.push(promise),
        tools: [draftTool],
      })
      await withClient(server, { era: '2025' }, async (client) => {
        await taskCall(client, 'draft')
      })
    }
    await Promise.all(calls)

    expect(results).toEqual([
      'ctx.context.sample in an execution: "task" tool needs the sample option of createMCPServer.',
      'from-adapter',
    ])
  })

  it('fails the task call when the store loses the task', async () => {
    const server = createMCPServer({
      name: 'tasks',
      version: '1.0.0',
      taskStore: {
        get: async () => null,
        set: async () => undefined,
        delete: async () => undefined,
      },
      tools: [
        toolDefinition({
          name: 'slow',
          description: 'Slow work',
          execution: 'task',
        }).server(async () => 'done'),
      ],
    })

    await withClient(server, { era: '2025' }, async (client) => {
      const called = await client.request(
        {
          method: 'tools/call',
          params: { name: 'slow', arguments: {}, task: {} },
        },
        callToolResult,
      )
      expect(called.isError).toBe(true)
      expect(JSON.stringify(called.content)).toMatch(/was not saved/)
    })
  })

  it('rejects a bad task id and a result that is not ready', async () => {
    const gate = deferredText()
    const server = createMCPServer({
      name: 'tasks',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'slow',
          description: 'Slow work',
          execution: 'task',
        }).server(async () => gate.work),
      ],
    })

    await withClient(server, { era: '2025' }, async (client) => {
      await expect(taskGet(client, '')).rejects.toThrow()
      const created = await taskCall(client, 'slow')
      await expect(taskResultOf(client, created.task.taskId)).rejects.toThrow(
        'Task result is not ready',
      )
      gate.resolve({ text: 'done' })
    })
  })

  it('returns a tool error for a tool without execute', async () => {
    const server = createMCPServer({
      name: 'weather',
      version: '1.0.0',
      tools: [{ ...echoTool(), execute: undefined }],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const called = await client.callTool({
        name: 'echo',
        arguments: { text: 'hi' },
      })
      expect(called.isError).toBe(true)
      expect(JSON.stringify(called.content)).toContain(
        'Tool echo has no execute function.',
      )
    })
  })

  it('accepts a JSON Schema input schema', async () => {
    const server = createMCPServer({
      name: 'weather',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'city',
          description: 'City name',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
        }).server(async () => 'ok'),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const listed = await client.listTools()
      expect(listed.tools[0]?.inputSchema).toMatchObject({
        properties: { city: { type: 'string' } },
      })
    })
  })

  it('reads every resource body shape and a uri template', async () => {
    const resource = (name: string, body: unknown) =>
      resourceDefinition({
        uri: `file:///${name}`,
        name,
        mimeType: 'text/plain',
      }).read(async () => body)
    const server = createMCPServer({
      name: 'files',
      version: '1.0.0',
      resources: [
        resource('blob', { blob: 'AAAA' }),
        resource('string', 'plain'),
        resource('json', { a: 1 }),
        resource('empty', undefined),
        resourceDefinition({
          uriTemplate: 'file:///users/{id}',
          name: 'user',
          mimeType: 'text/plain',
        }).read(async () => 'user'),
        { name: 'nowhere', mimeType: 'text/plain', read: async () => 'x' },
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const read = async (uri: string) =>
        (await client.readResource({ uri })).contents[0]
      expect(await read('file:///blob')).toMatchObject({ blob: 'AAAA' })
      expect(await read('file:///string')).toMatchObject({ text: 'plain' })
      expect(await read('file:///json')).toMatchObject({ text: '{"a":1}' })
      expect(await read('file:///empty')).toMatchObject({ text: '' })
      expect(await read('file:///users/7')).toMatchObject({
        uri: 'file:///users/7',
        text: 'user',
      })
      const listed = await client.listResources()
      expect(listed.resources.map((r) => r.name)).not.toContain('nowhere')
    })
  })

  it('gives a resource read the uri, variables, and request context, and lists a template', async () => {
    const summary = resourceDefinition({
      uriTemplate: 'myapp://items/{itemId}/summary',
      name: 'item-summary',
      mimeType: 'text/plain',
      list: async (ctx) => ({
        resources: [
          {
            uri: 'myapp://items/1/summary',
            name: `item 1 for ${String(ctx.context.tenant)}`,
          },
        ],
      }),
    }).read(
      async (uri, variables, ctx) =>
        `${uri.href} ${String(variables.itemId)} ${String(ctx.context.tenant)}`,
    )
    const server = createMCPServer({
      name: 'items',
      version: '1.0.0',
      resources: [summary],
    })

    for (const era of ['2026', '2025'] as const) {
      await withClient(
        server,
        { era, handleOptions: { context: { tenant: 'acme' } } },
        async (client) => {
          const read = await client.readResource({
            uri: 'myapp://items/7/summary',
          })
          expect(read.contents[0]).toMatchObject({
            text: 'myapp://items/7/summary 7 acme',
          })
          const listed = await client.listResources()
          expect(listed.resources).toContainEqual(
            expect.objectContaining({
              uri: 'myapp://items/1/summary',
              name: 'item 1 for acme',
            }),
          )
        },
      )
    }
  })

  it('sends a tool _meta from metadata to the host', async () => {
    const server = createMCPServer({
      name: 'apps',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'show_chart',
          description: 'Show a chart',
          inputSchema: z.object({}),
          metadata: { _meta: { ui: { resourceUri: 'ui://chart' } } },
        }).server(async () => 'ok'),
        toolDefinition({
          name: 'show_table',
          description: 'Show a table',
          inputSchema: z.object({}),
          metadata: {
            annotations: { readOnlyHint: true },
            _meta: { ui: { resourceUri: 'ui://table' } },
          },
        }).server(async () => 'ok'),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const listed = await client.listTools()
      expect(listed.tools[0]?._meta).toMatchObject({
        ui: { resourceUri: 'ui://chart' },
      })
      expect(listed.tools[1]?._meta).toMatchObject({
        ui: { resourceUri: 'ui://table' },
      })
      expect(listed.tools[1]?.annotations).toEqual({ readOnlyHint: true })
    })
  })

  it('serves a spec 2025 client without a session by default', async () => {
    const server = createMCPServer({
      name: 'stateless',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'tenant',
          description: 'Reports the tenant',
          inputSchema: z.object({}),
        }).server<MCPToolContext<{ tenant: string }>>(
          async (_args, ctx) => ctx.context.tenant,
        ),
      ],
    })

    const opened = await server.fetch(initializeRequest('any'))
    expect(opened.ok).toBe(true)
    expect(opened.headers.get('mcp-session-id')).toBeNull()

    await withClient(
      server,
      { era: '2025', handleOptions: { context: { tenant: 'acme' } } },
      async (client) => {
        const called = await client.callTool({ name: 'tenant', arguments: {} })
        expect(called.content).toEqual([{ type: 'text', text: 'acme' }])
      },
    )
  })

  it('reports SDK errors to onerror', async () => {
    const onerror = vi.fn()
    const server = createMCPServer({
      name: 'strict',
      version: '1.0.0',
      sessions: 'reject',
      onerror,
    })

    const rejected = await server.fetch(initializeRequest('any'))
    expect(rejected.ok).toBe(false)
    expect(onerror).toHaveBeenCalledWith(expect.any(Error))
  })

  it('reports a bad spec 2025 request to onerror when sessions is stateless', async () => {
    const onerror = vi.fn()
    const server = createMCPServer({
      name: 'stateless',
      version: '1.0.0',
      sessions: 'stateless',
      onerror,
      tools: [echoTool()],
    })

    const malformed = await server.fetch(
      new Request(serverUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-11-25',
        },
        body: '{"jsonrpc":"2.0","id":1,"method":',
      }),
    )
    expect(malformed.ok).toBe(false)
    expect(onerror).toHaveBeenCalledWith(expect.any(Error))
  })

  it('gives a stateless spec 2025 tool the token and a clear error for requestInput', async () => {
    const server = createMCPServer({
      name: 'stateless',
      version: '1.0.0',
      sessions: 'stateless',
      auth: subjectAuth,
      sample: async () => 'from-sample',
      tools: [
        toolDefinition({
          name: 'whoami',
          description: 'Who is calling',
          inputSchema: z.object({}),
        }).server<MCPToolContext>(async (_args, ctx) =>
          String(ctx.context.authInfo?.extra?.sub),
        ),
        toolDefinition({
          name: 'ask',
          description: 'Asks the user',
          inputSchema: z.object({}),
        }).server<MCPToolContext>(async (_args, ctx) =>
          String(await ctx.context.requestInput({ message: 'Which city?' })),
        ),
        toolDefinition({
          name: 'draft',
          description: 'Samples a draft',
          inputSchema: z.object({}),
        }).server<MCPToolContext>(async (_args, ctx) =>
          String(await ctx.context.sample(summaryRequest)),
        ),
      ],
    })

    const gated = await server.fetch(initializeRequest('alice'))
    expect(gated.ok).toBe(true)
    const anonymous = await server.fetch(mcpRequest(undefined))
    expect(anonymous.status).toBe(401)

    await withClient(
      server,
      { era: '2025', authToken: 'alice' },
      async (client) => {
        const who = await client.callTool({ name: 'whoami', arguments: {} })
        expect(who.content).toEqual([{ type: 'text', text: 'alice' }])
        const asked = await client.callTool({ name: 'ask', arguments: {} })
        expect(asked.isError).toBe(true)
        expect(JSON.stringify(asked.content)).toContain(
          'sessions: \\"memory\\"',
        )
        const drafted = await client.callTool({ name: 'draft', arguments: {} })
        expect(drafted.content).toEqual([{ type: 'text', text: 'from-sample' }])
      },
    )
  })

  it('converts each tool schema once, not on every request', async () => {
    const inputSchema = z.object({ text: z.string() })
    const toJson = vi.spyOn(inputSchema['~standard'].jsonSchema, 'input')
    const server = createMCPServer({
      name: 'cached',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'echo',
          description: 'Echo text',
          inputSchema,
        }).server(async (args) => args.text),
      ],
    })
    const afterCreate = toJson.mock.calls.length

    await withClient(server, { era: '2026' }, async (client) => {
      await client.listTools()
      await client.listTools()
    })
    expect(toJson.mock.calls.length).toBe(afterCreate)
  })

  it('advertises the output view of an output schema', async () => {
    const server = createMCPServer({
      name: 'counter',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'count',
          description: 'Counts',
          inputSchema: z.object({}),
          outputSchema: z.object({
            n: z.string().transform(Number).pipe(z.number()),
          }),
        }).server(async () => ({ n: '3' })),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const listed = await client.listTools()
      expect(listed.tools[0]?.outputSchema).toMatchObject({
        properties: { n: { type: 'number' } },
      })
      const called = await client.callTool({ name: 'count', arguments: {} })
      expect(called.isError).not.toBe(true)
      expect(called.structuredContent).toEqual({ n: 3 })
    })
  })

  it('starts with an output schema that has a bare transform', async () => {
    const server = createMCPServer({
      name: 'counter',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'count',
          description: 'Counts',
          inputSchema: z.object({}),
          outputSchema: z.object({ n: z.string().transform(Number) }),
        }).server(async () => ({ n: '3' })),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const listed = await client.listTools()
      expect(listed.tools[0]?.outputSchema).toBeUndefined()
      const called = await client.callTool({ name: 'count', arguments: {} })
      expect(called.isError).not.toBe(true)
      expect(called.structuredContent).toEqual({ n: 3 })
    })
  })

  it('parses output with an async output schema', async () => {
    const server = createMCPServer({
      name: 'counter',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'count',
          description: 'Counts',
          inputSchema: z.object({}),
          outputSchema: z
            .object({ n: z.number() })
            .refine(async (value) => value.n > 0),
        }).server(async () => ({ n: 3 })),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const called = await client.callTool({ name: 'count', arguments: {} })
      expect(called.isError).not.toBe(true)
      expect(called.structuredContent).toEqual({ n: 3 })
    })
  })

  it('returns a tool error that names the tool when output fails its schema', async () => {
    const server = createMCPServer({
      name: 'counter',
      version: '1.0.0',
      tools: [
        toolDefinition({
          name: 'broken',
          description: 'Returns output that fails its schema',
          inputSchema: z.object({}),
          outputSchema: z.object({ n: z.number() }),
        }).server(async () => JSON.parse('{"n":"x"}')),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const called = await client.callTool({ name: 'broken', arguments: {} })
      expect(called.isError).toBe(true)
      expect(JSON.stringify(called.content)).toContain(
        'Tool broken returned output that does not match its outputSchema',
      )
    })
  })

  it('parses a spec 2025 task result with the output schema', async () => {
    const calls: Array<Promise<unknown>> = []
    const server = createMCPServer({
      name: 'tasks',
      version: '1.0.0',
      waitUntil(promise) {
        calls.push(promise)
      },
      tools: [
        toolDefinition({
          name: 'count',
          description: 'Counts in a task',
          execution: 'task',
          outputSchema: z.object({
            n: z.string().transform(Number).pipe(z.number()),
          }),
        }).server(async () => ({ n: '3' })),
      ],
    })

    await withClient(server, { era: '2025' }, async (client) => {
      const created = await taskCall(client, 'count')
      await Promise.all(calls)
      expect(await taskResultOf(client, created.task.taskId)).toMatchObject({
        structuredContent: { n: 3 },
      })
    })
  })

  it('gives a fixed-uri resource the verified token and the context', async () => {
    const whoami = resourceDefinition({
      uri: 'myapp://whoami',
      name: 'whoami',
      mimeType: 'text/plain',
    }).read(
      async (_uri, variables, ctx) =>
        `${String(ctx.context.authInfo?.extra?.sub)}@${String(ctx.context.tenant)} ${JSON.stringify(variables)}`,
    )
    const server = createMCPServer({
      name: 'secure',
      version: '1.0.0',
      auth: subjectAuth,
      resources: [whoami],
    })
    const authInfo = {
      token: 'from-middleware',
      clientId: 'app',
      scopes: [],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      extra: { sub: 'carol' },
    }

    for (const era of ['2026', '2025'] as const) {
      await withClient(
        server,
        { era, handleOptions: { authInfo, context: { tenant: 'acme' } } },
        async (client) => {
          const read = await client.readResource({ uri: 'myapp://whoami' })
          expect(read.contents[0]).toMatchObject({ text: 'carol@acme {}' })
        },
      )
    }
  })

  it('reads a uri template with its variables and the MIME type of the body', async () => {
    const server = createMCPServer({
      name: 'files',
      version: '1.0.0',
      resources: [
        resourceDefinition({
          uriTemplate: 'media://{folder}/{id}',
          name: 'media',
          mimeType: 'application/octet-stream',
          argsSchema: z.object({ folder: z.string(), id: z.string() }),
        }).read(async (_uri, { folder, id }) => ({
          blob: btoa(`${folder}/${id}`),
          mimeType: 'image/png',
        })),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const read = await client.readResource({ uri: 'media://cats/7' })
      expect(read.contents[0]).toEqual({
        uri: 'media://cats/7',
        mimeType: 'image/png',
        blob: btoa('cats/7'),
      })
    })
  })

  it('keeps assistant prompt messages and drops invalid ones', async () => {
    const server = createMCPServer({
      name: 'prompts',
      version: '1.0.0',
      prompts: [
        promptDefinition({
          name: 'chat',
          description: 'Chat',
          argsSchema: z.object({}),
        }).render(async () => [
          { role: 'assistant', content: 'Hi' },
          { role: 'user', content: 'Hello' },
          // An invalid item from an untyped render function.
          JSON.parse('{"role":"user"}'),
        ]),
      ],
    })

    await withClient(server, { era: '2026' }, async (client) => {
      const prompt = await client.getPrompt({ name: 'chat', arguments: {} })
      expect(prompt.messages).toEqual([
        { role: 'assistant', content: { type: 'text', text: 'Hi' } },
        { role: 'user', content: { type: 'text', text: 'Hello' } },
      ])
    })
  })

  it('forgets a spec 2025 session that the client ends', async () => {
    const server = surfaceServer()
    let sessionId = ''

    await withClient(server, { era: '2025' }, async (_client, transport) => {
      sessionId = transport.sessionId ?? ''
      await transport.terminateSession()
    })

    const late = await server.fetch(sessionRequest('any', sessionId))
    expect(late.status).toBe(404)
  })

  it('does not keep a spec 2025 request that opens no session', async () => {
    const server = surfaceServer()
    const request = sessionRequest('any', 'x')
    request.headers.delete('mcp-session-id')

    const response = await server.fetch(request)
    expect(response.ok).toBe(false)
  })
})
