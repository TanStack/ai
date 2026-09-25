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

function surfaceServer() {
  return createMCPServer({
    name: 'weather',
    version: '1.0.0',
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
  server: { fetch(request: Request): Promise<Response> },
  hooks: {
    era: '2025' | '2026'
    authToken?: string
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
      const response = await server.fetch(new Request(input, init))
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
})
