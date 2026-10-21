/**
 * Live data-source SSE transport: the bridge from the server-side
 * {@link dataSources} registry to the browser renderer. `GET /api/live?source=
 * <name>&params=<json>` subscribes to the named source and streams each emission
 * as an SSE `data:` line; the subscription is torn down when the client (the
 * EventSource opened by `FrameArtifactRenderer`'s `subscribeData`) disconnects.
 *
 * This is what carries a live value from the host into a mounted iframe: the
 * client receives each message and pushes it over the bridge
 * (`host.data` / MCP Apps `tool-result`), so the frame's `useHostData()`
 * re-renders in real time.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { dataSources } from './data-sources'

export function handleLive(req: IncomingMessage, res: ServerResponse): void {
  const query = new URLSearchParams((req.url || '').split('?')[1] || '')
  const source = query.get('source') || ''
  let params: Record<string, unknown> = {}
  const raw = query.get('params')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object')
        params = parsed as Record<string, unknown>
    } catch {
      // Ignore malformed params; the source gets {}.
    }
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  // Open the stream (and defeat proxy buffering) with a comment line.
  res.write(': ok\n\n')

  const unsubscribe = dataSources.subscribe(source, params, (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    } catch {
      // Write after close — ignore; cleanup runs on 'close'.
    }
  })

  req.on('close', () => {
    try {
      unsubscribe()
    } catch {
      // ignore
    }
    res.end()
  })
}
