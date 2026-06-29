/**
 * Coco — dev-only Vite plugin.
 *
 * Wires the Coco panel directly into a TanStack Start (or plain Vite) app
 * without the reverse-proxy CLI:
 *
 * - Mounts `__coco/client.js` and `__coco/api/{agents,chat}` as Vite
 *   middleware.
 * - Injects the panel `<script>` tag into every HTML response — both
 *   `transformIndexHtml` (static index.html / pre-render) and a streaming
 *   response wrapper for SSR-rendered HTML.
 * - Activates only in `serve` (dev) mode.
 *
 * Usage in a project's `vite.config.ts`:
 *
 *   import { defineConfig } from 'vite'
 *   import { coco } from 'coco/vite'
 *   export default defineConfig({ plugins: [coco()] })
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { detectAgentConfig } from '../agent-status.ts'
import { handleChat } from '../chat-handler.ts'
import {
  injectIntoHtml,
  pipeFetchResponse,
  send404,
  send500,
  sendJson,
  serveClientBundle,
  toFetchRequest,
} from '../http-bridge.ts'
import type { IndexHtmlTransformResult, Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

export interface CocoPluginOptions {
  /**
   * Override the path used as the agent's `cwd`. Defaults to the Vite
   * server's `config.root` (the project containing `vite.config.ts`).
   */
  projectCwd?: string
  /**
   * Override the path Coco reads the prebuilt panel bundle from. Defaults
   * to `<this package>/dist/client/client.js`, which is what
   * `pnpm --filter coco build` produces.
   */
  clientBundlePath?: string
}

/** Default bundle location: two levels up from `src/vite/plugin.ts`. */
const defaultBundlePath = (): string => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..', '..', 'dist', 'client', 'client.js')
}

/**
 * Wrap an outgoing response so the final HTML body has the panel script
 * injected. We only touch responses whose `content-type` includes
 * `text/html`; everything else is passed through.
 */
const wrapHtmlResponse = (res: ServerResponse): void => {
  const sym = Symbol.for('coco.wrapped')
  const tagged = res as ServerResponse & { [k: symbol]: boolean }
  if (tagged[sym]) return
  tagged[sym] = true

  const chunks: Array<Buffer> = []
  let intercepting = true

  const isHtml = (): boolean => {
    const ct = res.getHeader('content-type')
    const str = Array.isArray(ct) ? ct.join(',') : String(ct ?? '')
    return str.toLowerCase().includes('text/html')
  }

  const origWrite = res.write.bind(res)
  const origEnd = res.end.bind(res)

  res.write = function patchedWrite(
    chunk: unknown,
    ...rest: Array<unknown>
  ): boolean {
    if (intercepting && isHtml() && chunk != null) {
      chunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string, 'utf8'),
      )
      return true
    }
    if (intercepting && !isHtml()) {
      intercepting = false
      // Replay any buffered chunks before the runtime told us this isn't
      // HTML. In practice content-type is set before the first write so
      // this branch is rare.
      for (const c of chunks) origWrite(c)
      chunks.length = 0
    }

    return (origWrite as any)(chunk, ...rest)
  } as typeof res.write

  res.end = function patchedEnd(
    chunk?: unknown,
    ...rest: Array<unknown>
  ): ServerResponse {
    if (intercepting && isHtml()) {
      if (chunk != null) {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string, 'utf8'),
        )
      }
      const original = Buffer.concat(chunks).toString('utf8')
      const injected = injectIntoHtml(original)
      const body = Buffer.from(injected, 'utf8')
      // Vite/Nitro tend to set content-length before end(); fix it up so the
      // client doesn't truncate.
      res.setHeader('content-length', body.length)
      res.removeHeader('content-encoding')
      return origEnd(body)
    }
    intercepting = false
    if (chunks.length > 0) {
      for (const c of chunks) origWrite(c)
      chunks.length = 0
    }

    return (origEnd as any)(chunk, ...rest)
  } as typeof res.end
}

const handleCocoRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  opts: { bundlePath: string; projectCwd: string },
): Promise<boolean> => {
  const rawUrl = req.url ?? '/'
  const pathname = rawUrl.split('?')[0]

  if (pathname === '/__coco/client.js' && req.method === 'GET') {
    await serveClientBundle(res, opts.bundlePath)
    return true
  }

  if (pathname === '/__coco/api/agents' && req.method === 'GET') {
    sendJson(res, 200, await detectAgentConfig())
    return true
  }

  if (pathname === '/__coco/api/chat' && req.method === 'POST') {
    const fetchReq = toFetchRequest(req)
    const fetchRes = await handleChat(fetchReq, opts.projectCwd)
    await pipeFetchResponse(fetchRes, res)
    return true
  }

  if (pathname.startsWith('/__coco/')) {
    send404(res, 'Unknown __coco endpoint')
    return true
  }

  return false
}

/**
 * Coco Vite plugin.
 *
 *   import { coco } from 'coco/vite'
 *   plugins: [coco()]
 */
export function coco(options: CocoPluginOptions = {}): Plugin {
  const explicitBundle = options.clientBundlePath
  const explicitCwd = options.projectCwd

  let projectCwd: string = explicitCwd ?? process.cwd()
  const bundlePath: string = explicitBundle ?? defaultBundlePath()

  return {
    name: 'coco',
    apply: 'serve',

    configureServer(server: ViteDevServer) {
      projectCwd = explicitCwd ?? server.config.root

      // Install BEFORE Vite's internal middlewares so we own the `__coco/*`
      // namespace and can wrap responses for HTML routes.
      server.middlewares.use(async (req, res, next) => {
        try {
          const handled = await handleCocoRequest(req, res, {
            bundlePath,
            projectCwd,
          })
          if (handled) return
          wrapHtmlResponse(res)
          next()
        } catch (err) {
          send500(res, err)
        }
      })

      server.config.logger.info(
        `  \u001b[36m\u279c\u001b[0m  \u001b[1mCoco\u001b[0m: panel ready at \u001b[36m/__coco/client.js\u001b[0m (cwd: ${projectCwd})`,
      )
    },

    // Cover the traditional Vite static-index.html path as well so plain
    // SPAs work without relying on the response wrapper at all.
    transformIndexHtml(html: string): IndexHtmlTransformResult {
      return injectIntoHtml(html)
    },
  }
}

export default coco
