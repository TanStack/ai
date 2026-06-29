/**
 * Helpers for shuttling Node `http` request/response objects through Web
 * `Request`/`Response` and serving Coco's small set of internal endpoints.
 *
 * Shared between:
 *
 * - the reverse-proxy CLI (`proxy.ts`), and
 * - the dev-only Vite plugin (`vite/plugin.ts`).
 *
 * Keeping them here ensures both surfaces inject the same `<script>` tag,
 * speak the same `/__coco/api/*` protocol, and pipe streaming chat
 * responses identically.
 */
import { promises as fs } from 'node:fs'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

const INJECTED_TAG = '<script type="module" src="/__coco/client.js"></script>'

/**
 * Insert Coco's panel `<script>` just before `</body>`. Idempotent — if the
 * tag is already present we leave the HTML untouched.
 */
export const injectIntoHtml = (html: string): string => {
  if (html.includes('/__coco/client.js')) return html
  const lower = html.toLowerCase()
  const idx = lower.lastIndexOf('</body>')
  if (idx >= 0) {
    return html.slice(0, idx) + INJECTED_TAG + html.slice(idx)
  }
  return html + INJECTED_TAG
}

const requestUrl = (req: IncomingMessage): string => {
  const host = req.headers.host ?? 'localhost'
  return `http://${host}${req.url ?? '/'}`
}

/**
 * Convert a Node IncomingMessage into a Web `Request`. The body is taken
 * directly from the readable stream for POSTs.
 */
export const toFetchRequest = (req: IncomingMessage): Request => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else headers.set(key, value)
  }
  const method = (req.method ?? 'GET').toUpperCase()
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
  }
  if (hasBody) {
    init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>
    init.duplex = 'half'
  }
  return new Request(requestUrl(req), init)
}

/**
 * Pipe a Web `Response` back into a Node ServerResponse. Streams the body so
 * SSE flows in real-time.
 */
export const pipeFetchResponse = async (
  response: Response,
  res: ServerResponse,
): Promise<void> => {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  res.writeHead(response.status, headers)
  if (!response.body) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  const onClose = () => {
    reader.cancel().catch(() => undefined)
  }
  res.once('close', onClose)
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      res.write(value)
    }
  } finally {
    res.off('close', onClose)
    res.end()
  }
}

export const sendJson = (
  res: ServerResponse,
  status: number,
  value: unknown,
): void => {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

export const send404 = (res: ServerResponse, msg = 'Not found'): void => {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(msg)
}

export const send500 = (res: ServerResponse, err: unknown): void => {
  if (res.headersSent) {
    res.end()
    return
  }
  const body = err instanceof Error ? err.message : String(err)
  res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(body)
}

/**
 * Serve the prebuilt panel bundle. Returns `false` if the bundle is missing
 * so the caller can decide whether to surface a friendly error or fall
 * through to other handlers.
 */
export const serveClientBundle = async (
  res: ServerResponse,
  bundlePath: string,
): Promise<void> => {
  try {
    const buf = await fs.readFile(bundlePath)
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    })
    res.end(buf)
  } catch {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(
      'Coco panel bundle is missing. Run `pnpm --filter coco build` and reload.',
    )
  }
}
