/**
 * Small adapter between `node:http` and Web `Request` / `Response`. The MCP
 * server transport takes a Web `Request` and returns a Web `Response`, but the
 * host bridge listens with `node:http`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Read the full request body as bytes. */
export async function readRawBody(req: IncomingMessage) {
  const chunks: Array<Uint8Array> = []
  for await (const chunk of req) {
    chunks.push(
      typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk,
    )
  }
  return Buffer.concat(chunks)
}

/** Build a Web `Request` from a node request and its body bytes. */
export function toWebRequest(
  req: IncomingMessage,
  rawBody: Uint8Array<ArrayBuffer>,
) {
  const url = `http://${req.headers.host ?? '127.0.0.1'}${req.url ?? '/'}`
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
  const hasBody = method !== 'GET' && method !== 'HEAD'
  return new Request(url, {
    method,
    headers,
    body: hasBody ? rawBody : undefined,
  })
}

/**
 * Write a Web `Response` to a node response. The body is written chunk by
 * chunk, so an SSE stream reaches the client while the server writes it.
 * When the client or the bridge closes the socket first, the Web stream is
 * cancelled and this function returns.
 */
export async function sendWebResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  if (response.body === null) {
    res.end()
    return
  }
  // Send the headers now. An SSE client waits for them before the first event.
  res.flushHeaders()
  const reader = response.body.getReader()
  // A cancel makes the pending read() return done, so the loop below stops.
  res.on('close', () => void reader.cancel())
  // ponytail: no backpressure wait. MCP messages are small. Add a 'drain'
  // wait if a tool ever streams large output.
  for (
    let chunk = await reader.read();
    !chunk.done;
    chunk = await reader.read()
  ) {
    res.write(chunk.value)
  }
  res.end()
}
