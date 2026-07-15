/**
 * Coco's reverse-proxy server. Forwards everything to the user's dev server
 * EXCEPT:
 *
 * - `/__coco/client.js`  — serves the built panel bundle.
 * - `/__coco/api/*`      — our own routes (chat, agent status).
 *
 * For proxied `text/html` responses it injects a `<script>` tag pointing at
 * `/__coco/client.js` just before `</body>`, so every page the user navigates
 * to gets the panel.
 */
import http from 'node:http'
import path from 'node:path'
import { URL } from 'node:url'
import httpProxy from 'http-proxy'
import { detectAgentConfig } from './agent-status.ts'
import { handleChat } from './chat-handler.ts'
import {
  injectIntoHtml,
  pipeFetchResponse,
  send404,
  send500,
  sendJson,
  serveClientBundle,
  toFetchRequest,
} from './http-bridge.ts'
import type { IncomingMessage } from 'node:http'

export interface ProxyOptions {
  /** Upstream dev-server URL (e.g. `http://localhost:5173`). */
  target: string
  /** Port Coco listens on. */
  port: number
  /** Working directory (passed to the agent). */
  projectCwd: string
  /** Absolute path to the built panel bundle (`dist/client/client.js`). */
  clientBundlePath: string
}

/**
 * Strip `accept-encoding` so the dev server returns HTML uncompressed and we
 * can inject a script without round-tripping through gzip/br.
 */
const stripAcceptEncoding = (req: IncomingMessage) => {
  delete req.headers['accept-encoding']
}

/**
 * Build and start Coco's proxy server. Returns a promise that resolves to a
 * stop function.
 */
export const startProxyServer = async (
  options: ProxyOptions,
): Promise<{ url: string; stop: () => Promise<void> }> => {
  const { target, port, projectCwd, clientBundlePath } = options

  const proxy = httpProxy.createProxyServer({
    target,
    changeOrigin: true,
    ws: true,
    selfHandleResponse: true,
    // Preserve original Host so dev servers that gate on it (e.g. Vite's
    // allowed-hosts) accept the request.
    autoRewrite: true,
  })

  proxy.on('error', (err, _req, resOrSocket) => {
    if (resOrSocket && 'writeHead' in resOrSocket) {
      try {
        const res = resOrSocket
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
        }
        res.end(`Coco proxy error: ${err.message}`)
      } catch {
        // ignore
      }
    } else if (resOrSocket && 'destroy' in resOrSocket) {
      ;(resOrSocket as { destroy: () => void }).destroy()
    }
  })

  // Custom response handling: buffer HTML to inject the panel script;
  // stream everything else straight through.
  proxy.on('proxyRes', (proxyRes, _req, res) => {
    const contentType = String(proxyRes.headers['content-type'] ?? '')
    const isHtml = contentType.includes('text/html')

    const status = proxyRes.statusCode ?? 502
    const headers = { ...proxyRes.headers }

    if (isHtml) {
      const chunks: Array<Buffer> = []
      proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk))
      proxyRes.on('end', () => {
        const original = Buffer.concat(chunks).toString('utf8')
        const injected = injectIntoHtml(original)
        const body = Buffer.from(injected, 'utf8')
        delete headers['content-length']
        delete headers['content-encoding']
        headers['content-length'] = String(body.length)
        res.writeHead(status, headers)
        res.end(body)
      })
      proxyRes.on('error', (err) => send500(res, err))
    } else {
      res.writeHead(status, headers)
      proxyRes.pipe(res)
    }
  })

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const pathname = url.pathname

      if (pathname === '/__coco/client.js') {
        await serveClientBundle(res, clientBundlePath)
        return
      }
      if (pathname === '/__coco/api/agents' && req.method === 'GET') {
        sendJson(res, 200, await detectAgentConfig())
        return
      }
      if (pathname === '/__coco/api/chat' && req.method === 'POST') {
        const fetchReq = toFetchRequest(req)
        const fetchRes = await handleChat(fetchReq, projectCwd)
        await pipeFetchResponse(fetchRes, res)
        return
      }
      if (pathname.startsWith('/__coco/')) {
        send404(res, 'Unknown __coco endpoint')
        return
      }

      stripAcceptEncoding(req)
      proxy.web(req, res, { target })
    } catch (err) {
      send500(res, err)
    }
  })

  server.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/__coco/')) {
      socket.destroy()
      return
    }
    proxy.ws(req, socket, head, { target })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const url = `http://localhost:${port}`

  const stop = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve())
      proxy.close()
    })

  // touch the path so a bare `--target` ENOENT bundle path produces a
  // friendlier error at request time rather than at startup.
  void path.basename(clientBundlePath)

  return { url, stop }
}
