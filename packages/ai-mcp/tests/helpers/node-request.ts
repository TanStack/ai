import type { IncomingMessage, ServerResponse } from 'node:http'

export async function readRawBody(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Array<Uint8Array> = []
  let total = 0
  for await (const chunk of req) {
    const bytes =
      typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
    total += bytes.byteLength
    chunks.push(bytes)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

export function toWebRequest(
  req: IncomingMessage,
  rawBody: Uint8Array,
): Request {
  const host = req.headers.host ?? '127.0.0.1'
  const url = `http://${host}${req.url ?? '/'}`
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else {
      headers.set(key, value)
    }
  }
  const method = req.method ?? 'GET'
  return new Request(url, {
    method,
    headers,
    body:
      method === 'GET' || method === 'HEAD' ? undefined : (rawBody as BodyInit),
  })
}

export async function sendWebResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  const buf = new Uint8Array(await response.arrayBuffer())
  res.end(buf)
}
