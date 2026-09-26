import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
} from '@tanstack/ai-harness'
import { mcpConnector } from '../src/connector'
import type { IncomingMessage, Server } from 'node:http'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

/**
 * A local MCP server behind OAuth, like Notion's or Linear's: protected
 * resource metadata, authorization server metadata, dynamic client
 * registration, a token endpoint, and an `echo` tool.
 */
async function startProtectedServer() {
  const seen = { registrations: 0, tokenRequests: [] as Array<URLSearchParams> }
  let base = ''
  const readBody = async (req: IncomingMessage) => {
    const chunks: Array<Buffer> = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString('utf8')
  }
  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', base)
      const json = (status: number, value: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(value))
      }
      if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
        return json(200, {
          resource: `${base}/mcp`,
          authorization_servers: [base],
        })
      }
      if (url.pathname.startsWith('/.well-known/oauth-authorization-server')) {
        return json(200, {
          issuer: base,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/token`,
          registration_endpoint: `${base}/register`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
        })
      }
      if (url.pathname === '/register' && req.method === 'POST') {
        seen.registrations += 1
        const metadata = JSON.parse(await readBody(req))
        return json(201, { ...metadata, client_id: 'client-1' })
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        const form = new URLSearchParams(await readBody(req))
        seen.tokenRequests.push(form)
        if (
          form.get('grant_type') === 'authorization_code' &&
          form.get('code') === 'code-1'
        ) {
          return json(200, {
            access_token: 'access-1',
            refresh_token: 'refresh-1',
            token_type: 'Bearer',
            expires_in: 3600,
          })
        }
        return json(400, { error: 'invalid_grant' })
      }
      if (url.pathname === '/mcp') {
        if (req.headers.authorization !== 'Bearer access-1') {
          res.writeHead(401, {
            'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
          })
          res.end()
          return
        }
        if (req.method !== 'POST') {
          res.writeHead(405).end()
          return
        }
        const mcp = new McpServer({ name: 'protected', version: '1.0.0' })
        mcp.registerTool(
          'echo',
          {
            description: 'Echo text',
            inputSchema: { text: z.string() },
            annotations: { readOnlyHint: true },
          },
          async ({ text }) => ({
            content: [{ type: 'text' as const, text: `echo: ${text}` }],
          }),
        )
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        })
        await mcp.connect(transport)
        await transport.handleRequest(req, res, JSON.parse(await readBody(req)))
        return
      }
      res.writeHead(404).end()
    })()
  })
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  )
  const address = server.address()
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  return {
    url: `${base}/mcp`,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

/** A model that calls `tool` once, then answers with the tool result it saw. */
function modelCalling(
  tool: string,
  args: Record<string, unknown>,
): AnyTextAdapter {
  let call = 0
  const now = () => Date.now()
  return {
    kind: 'text',
    name: 'mock',
    model: 'mock',
    '~types': {
      providerOptions: {} as Record<string, unknown>,
      inputModalities: ['text'] as readonly ['text'],
      messageMetadataByModality: {
        text: undefined as unknown,
        image: undefined as unknown,
        audio: undefined as unknown,
        video: undefined as unknown,
        document: undefined as unknown,
      },
      toolCapabilities: [] as ReadonlyArray<string>,
      toolCallMetadata: undefined as unknown,
      systemPromptMetadata: undefined as never,
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        call += 1
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
        }
        if (call === 1) {
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'c1',
            toolCallName: tool,
            timestamp: now(),
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'c1',
            delta: JSON.stringify(args),
            timestamp: now(),
          }
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'c1',
            timestamp: now(),
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId: 'r',
            threadId: 't',
            timestamp: now(),
            metadata: { tanstack: { finishReason: 'tool_calls' } },
          }
          return
        }
        const last = options.messages.at(-1)
        const text = `saw: ${typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content)}`
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: `m${call}`,
          role: 'assistant',
          timestamp: now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: `m${call}`,
          delta: text,
          timestamp: now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: `m${call}`,
          timestamp: now(),
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
  }
}

const cleanups: Array<() => unknown> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

describe('mcpConnector', () => {
  it('signs in with OAuth discovery, registration, and PKCE, then gives the model the server tools', async () => {
    const protectedServer = await startProtectedServer()
    cleanups.push(() => protectedServer.close())
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    cleanups.push(() => host.close())
    const harness = defineHarness({
      name: 'test/mcp-connector',
      adapter: modelCalling('demo_echo', { text: 'hello' }),
      plugins: () => [
        mcpConnector({ id: 'demo', label: 'Demo', url: protectedServer.url }),
      ],
    })
    const session = await host.open(harness, {
      threadId: 't',
      principal: { id: 'user-1' },
    })

    // Act as the browser: approve the sign-in by calling the loopback redirect.
    const reader = new AbortController()
    let authorizationUrl: URL | undefined
    void (async () => {
      for await (const entry of session.events({ signal: reader.signal })) {
        const event = entry.event
        if (
          event.type === EventType.CUSTOM &&
          event.name === HARNESS_EVENTS.authRequired
        ) {
          authorizationUrl = new URL(
            String((event.value as { url: string }).url),
          )
          const redirect = new URL(
            authorizationUrl.searchParams.get('redirect_uri') ?? '',
          )
          redirect.searchParams.set('code', 'code-1')
          redirect.searchParams.set(
            'state',
            authorizationUrl.searchParams.get('state') ?? '',
          )
          await fetch(redirect)
        }
      }
    })()
    cleanups.push(() => reader.abort())

    await expect(session.command('connect:demo')).resolves.toBe(
      'Connected to Demo.',
    )
    expect(authorizationUrl?.searchParams.get('client_id')).toBe('client-1')
    expect(authorizationUrl?.searchParams.get('code_challenge_method')).toBe(
      'S256',
    )
    expect(
      new URL(authorizationUrl?.searchParams.get('redirect_uri') ?? '')
        .hostname,
    ).toBe('127.0.0.1')
    expect(protectedServer.seen.registrations).toBe(1)
    expect(
      protectedServer.seen.tokenRequests[0]?.get('code_verifier'),
    ).toBeTruthy()

    const saved = await persistence.stores.credentials.get(
      { threadId: 't', userId: 'user-1' },
      'demo',
    )
    expect(saved).toMatchObject({
      type: 'oauth',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      client: { clientId: 'client-1' },
    })

    const turn = await session.prompt('echo hello')
    expect(turn.text).toContain('echo: hello')
    // The model never sees the token.
    expect(
      JSON.stringify(await persistence.stores.messages.loadThread('t')),
    ).not.toContain('access-1')

    await session.command('disconnect:demo')
    expect(
      await persistence.stores.credentials.get(
        { threadId: 't', userId: 'user-1' },
        'demo',
      ),
    ).toBeNull()
  })

  it('tells the model to ask for /connect before sign-in', async () => {
    const seen = vi.fn()
    const adapter: AnyTextAdapter = {
      ...modelCalling('x', {}),
      chatStream: (options) => {
        seen(options.systemPrompts)
        return (async function* (): AsyncGenerator<StreamChunk> {
          yield {
            type: EventType.RUN_STARTED,
            runId: 'r',
            threadId: 't',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId: 'r',
            threadId: 't',
            timestamp: Date.now(),
            metadata: { tanstack: { finishReason: 'stop' } },
          }
        })()
      },
    }
    const host = createHarnessHost({ persistence: memoryPersistence() })
    cleanups.push(() => host.close())
    const session = await host.open(
      defineHarness({
        name: 'test/mcp-connector-off',
        adapter,
        plugins: () => [
          mcpConnector({
            id: 'demo',
            label: 'Demo',
            url: 'http://127.0.0.1:9/mcp',
          }),
        ],
      }),
      { threadId: 't' },
    )
    await session.prompt('hi')
    expect(JSON.stringify(seen.mock.calls[0]?.[0])).toContain(
      'run /connect demo',
    )
    expect(session.commands().map((command) => command.name)).toEqual([
      'connect:demo',
      'disconnect:demo',
    ])
  })
})
