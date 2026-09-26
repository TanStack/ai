import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createHarnessHandler } from '@tanstack/ai-harness'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import type { AnyHarness, HarnessHost } from '@tanstack/ai-harness'

export interface ServeOptions {
  host: HarnessHost
  harness: AnyHarness
  port: number
  hostname: string
  /** Every request must send `Authorization: Bearer <token>`. */
  token: string
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
  // `Readable.fromWeb` takes the stream type from node:stream/web.
  Readable.fromWeb(response.body as NodeReadableStream).pipe(res)
}

/**
 * Serve the harness session protocol over HTTP (capabilities, run, events,
 * control, snapshot). Every request needs the bearer token.
 */
export function serve(
  options: ServeOptions,
): Promise<{ url: string; close: () => Promise<void> }> {
  const handler = createHarnessHandler({
    host: options.host,
    harness: options.harness,
    authorize: (request) =>
      sameToken(request.headers.get('authorization'), options.token)
        ? { id: 'cli' }
        : null,
  })
  const server = createServer((req, res) => {
    const aborter = new AbortController()
    res.on('close', () => aborter.abort())
    void (async () => {
      try {
        const base = `http://${req.headers.host ?? `${options.hostname}:${options.port}`}`
        await send(
          res,
          await handler(await toRequest(req, base, aborter.signal)),
        )
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
