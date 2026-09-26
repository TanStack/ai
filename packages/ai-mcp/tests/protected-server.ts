import { createServer } from 'node:http'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { IncomingMessage, Server } from 'node:http'

/**
 * A local MCP server behind OAuth, like Notion's or Linear's: protected
 * resource metadata, authorization server metadata, dynamic client
 * registration, a token endpoint, and an `echo` tool.
 *
 * - The code `code-1` gives `access-1` and `refresh-1`.
 * - The refresh token `refresh-1` gives `access-2` (and no new refresh token).
 * - `revoke(token)` makes the MCP endpoint refuse a token.
 */
export async function startProtectedServer() {
  const seen = {
    registrations: [] as Array<Record<string, unknown>>,
    tokenRequests: [] as Array<URLSearchParams>,
  }
  const valid = new Set(['access-1'])
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
        const metadata = JSON.parse(await readBody(req))
        seen.registrations.push(metadata)
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
            scope: 'read write',
          })
        }
        if (
          form.get('grant_type') === 'refresh_token' &&
          form.get('refresh_token') === 'refresh-1'
        ) {
          valid.add('access-2')
          return json(200, { access_token: 'access-2', token_type: 'Bearer' })
        }
        return json(400, { error: 'invalid_grant' })
      }
      if (url.pathname === '/mcp') {
        const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
        if (!valid.has(token)) {
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
    revoke: (token: string) => valid.delete(token),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
