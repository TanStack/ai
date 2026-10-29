import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { loadOptional } from './optional'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import type { AnyHarness, HarnessHost, HarnessUser } from '@tanstack/ai-harness'
import type { McpHarnessModule } from './optional'

export interface ServeOptions<U extends HarnessUser = HarnessUser> {
  /**
   * The host. With `access`, `access.getUser` reads the user of each
   * request that has the token.
   */
  host: HarnessHost<U>
  harness: AnyHarness
  port: number
  hostname: string
  /**
   * Every request must send `Authorization: Bearer <token>`. Only a signed
   * media URL needs no token. On a host with access, the handler still reads
   * its user with `getUser`.
   */
  token: string
  /**
   * The key that signs media URLs, at least 32 bytes (UTF-8). Default: a new
   * random key at each start, so a signed URL stops working after a restart.
   * It is never made from `token`: a signed URL is given out without the
   * token, and must not let anyone guess it.
   */
  mediaKey?: string
  /** The conversation of an MCP tool call that names none. Default `'main'`. */
  threadId?: string
  /** How `/mcp` handles tool calls that need approval. Default `'ask'`. */
  approvals?: 'ask' | 'auto'
  /**
   * On a host without access: who a request with the token is. Without it,
   * each request runs with no user (one user).
   */
  user?: U
}

/**
 * The MCP server for `/mcp`, or `undefined` without `@tanstack/ai-mcp`. It
 * runs each call as the same user as the session protocol routes.
 */
async function mcpServer<U extends HarnessUser>(
  options: ServeOptions<U>,
  withAccess: boolean,
) {
  const mcp = await loadOptional<McpHarnessModule>(
    '@tanstack/ai-mcp/harness',
    'createHarnessMcpServer',
  )
  if (mcp === undefined) return undefined
  const { host, harness, user } = options
  const shared = {
    host,
    harness,
    threadId: options.threadId,
    approvals: options.approvals,
  }
  // On a host with access, `getUser` reads the user of each request.
  if (withAccess) return mcp.createHarnessMcpServer(shared)
  return mcp.createHarnessMcpServer({
    ...shared,
    openAccess: user ? { user } : true,
  })
}

/** A signed media URL needs no token: the handler checks its signature. */
function isSignedMedia(request: Request) {
  const url = new URL(request.url)
  return (
    request.method === 'GET' &&
    url.pathname.split('/').at(-1) === 'media' &&
    url.searchParams.has('sig')
  )
}

/** A random token for `--serve` when none is given. */
export function createToken(): string {
  return randomBytes(24).toString('base64url')
}

function sameToken(given: string | null, expected: string): boolean {
  if (!given?.startsWith('Bearer ')) return false
  const a = Buffer.from(given.slice(7))
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function toRequest(
  req: IncomingMessage,
  base: string,
  signal: AbortSignal,
): Promise<Request> {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value)) headers.set(key, value.join(', '))
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const chunks: Array<Buffer> = []
  if (hasBody) for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return new Request(new URL(req.url ?? '/', base), {
    method: req.method ?? 'GET',
    headers,
    signal,
    ...(hasBody ? { body: Buffer.concat(chunks) } : {}),
  })
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (!response.body) {
    res.end()
    return
  }
  // `Readable.fromWeb` takes the stream type from node:stream/web. When the
  // body fails, for example after the client left, `pipeline` ends `res`.
  await pipeline(
    Readable.fromWeb(response.body as NodeReadableStream),
    res,
  ).catch(() => {})
}

/**
 * Serve the harness session protocol over HTTP (capabilities, run, events,
 * control, snapshot). With `@tanstack/ai-mcp` installed, `/mcp` serves the
 * harness as an MCP server. Every request needs the bearer token, except a
 * signed media URL. Then on a host with access, `getUser` reads the user of
 * the request, and the host checks each action. Without access, each
 * request runs as `user`.
 */
export async function serve<U extends HarnessUser = HarnessUser>(
  options: ServeOptions<U>,
): Promise<{ url: string; close: () => Promise<void> }> {
  const { host, harness, user } = options
  const isAllowed = (request: Request) =>
    sameToken(request.headers.get('authorization'), options.token)
  const withAccess = host.hasAccess
  // Without `mediaKey`, the handler signs with a new random key, so signed
  // media URLs stop working after a restart.
  const media =
    options.mediaKey !== undefined
      ? { media: { secret: options.mediaKey } }
      : {}
  const handler = withAccess
    ? createHarnessHandler({ host, harness, ...media })
    : createHarnessHandler({
        host,
        harness,
        // One user holds the token, so it can use every thread.
        openAccess: user ? { user } : true,
        ...media,
      })
  const mcp = await mcpServer(options, withAccess)
  const route = (request: Request) => {
    if (!isAllowed(request) && !isSignedMedia(request)) {
      return Response.json({ error: 'unauthorized' }, { status: 401 })
    }
    const isMcp = mcp !== undefined && new URL(request.url).pathname === '/mcp'
    return isMcp ? mcp.fetch(request) : handler(request)
  }
  const server = createServer((req, res) => {
    const aborter = new AbortController()
    res.on('close', () => aborter.abort())
    // Refuse a body without the token before reading it. Signed media URLs
    // carry no token, but they are GET requests.
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    if (
      hasBody &&
      !sameToken(req.headers.authorization ?? null, options.token)
    ) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }
    void (async () => {
      try {
        const base = `http://${req.headers.host ?? `${options.hostname}:${options.port}`}`
        await send(res, await route(await toRequest(req, base, aborter.signal)))
      } catch (error) {
        if (!res.headersSent)
          res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    })()
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.hostname, () => {
      const address = server.address()
      const port =
        typeof address === 'object' && address ? address.port : options.port
      resolve({
        url: `http://${options.hostname}:${port}`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections()
            server.close(() => done())
          }),
      })
    })
  })
}
