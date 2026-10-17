/**
 * Tier F serving layer for the POC host (Draft 0.2 §4, §5), as Vite dev
 * middleware. Serves the sandbox routes — shell document, pinned built assets,
 * pinned runtime modules, standalone page — and the library list, all over the
 * SHARED async artifact store from `./frame-host` (the same store the chat
 * middleware writes to). Build-at-write-time happens in the middleware / seeding
 * now, not here.
 *
 * Single-origin POC caveat: a production host serves `/sandbox/*` from a
 * dedicated origin (§4.2); here the iframe's `sandbox="allow-scripts"` (no
 * allow-same-origin) yields an opaque origin, so the frame cannot reach app
 * cookies/DOM — but same-origin isolation is weaker than §4.2 requires.
 */

import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import type { Plugin } from 'vite'
import { buildCsp, buildShellDocument, type ArtifactRecord, type FrameTheme } from '@tanstack/ai-generative-ui'
import { RUNTIME_NPM, RUNTIME_SHIMS } from './frame-runtime'
import { registry, seedFixtures, store } from './frame-host'
import { mcpServer } from './mcp-server'

/** Bridge a Node request → web Request → mcpServer.fetch → Node response. */
async function handleMcp(req: any, res: any): Promise<void> {
  const chunks: Array<Buffer> = []
  for await (const c of req) chunks.push(c as Buffer)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  const method = req.method || 'GET'
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
  })
  const response = await mcpServer.fetch(request)
  res.statusCode = response.status
  response.headers.forEach((value: string, key: string) => res.setHeader(key, value))
  if (response.body) {
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) res.write(Buffer.from(value))
    }
  }
  res.end()
}

// esbuild is a transitive dep of Vite (not a direct example dep); resolve its
// bundler through Vite so the config needs no extra dependency.
const localRequire = createRequire(import.meta.url)
let esbuildCache: any = null
function esbuildBundler(): any {
  if (!esbuildCache) {
    const vitePath = localRequire.resolve('vite')
    esbuildCache = createRequire(vitePath)('esbuild')
  }
  return esbuildCache
}

// Default theme sent on first paint; the client renderer re-pushes the host's
// real `--ui-*` tokens over the bridge once mounted (§5.2).
const SERVER_THEME: FrameTheme = {
  mode: 'light',
  tokens: {
    '--ui-bg': '#ffffff',
    '--ui-surface': '#ffffff',
    '--ui-surface-2': '#f8fafc',
    '--ui-text': '#0f172a',
    '--ui-muted': '#64748b',
    '--ui-border': '#e5e7eb',
    '--ui-accent': '#2563eb',
    '--ui-accent-text': '#ffffff',
    '--ui-positive': '#16a34a',
    '--ui-negative': '#dc2626',
    '--ui-radius': '14px',
  },
}

export function frameApiPlugin(): Plugin {
  const exampleRoot = resolve(import.meta.dirname, '..')
  const runtimeCache = new Map<string, string>()

  async function bundleRuntime(file: string): Promise<string | null> {
    if (runtimeCache.has(file)) return runtimeCache.get(file)!
    if (RUNTIME_SHIMS[file]) {
      runtimeCache.set(file, RUNTIME_SHIMS[file])
      return RUNTIME_SHIMS[file]
    }
    const npm = RUNTIME_NPM[file]
    if (!npm) return null
    const result = await esbuildBundler().build({
      stdin: { contents: npm.entry, loader: 'js', resolveDir: exampleRoot },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
      external: npm.external,
      write: false,
      legalComments: 'none',
    })
    const code = result.outputFiles?.[0]?.text ?? ''
    runtimeCache.set(file, code)
    return code
  }

  const sendJs = (res: any, code: string) => {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    // The sandboxed frame has an opaque origin, so its ES-module fetches are
    // cross-origin and require CORS. (A dedicated sandbox origin, §4.2, serves
    // these same-origin and would not need this.)
    res.setHeader('Access-Control-Allow-Origin', '*')
    // Spec serves content-addressed runtime/assets `immutable` (§4.3); in this
    // dev POC the URLs are stable while content changes, so disable caching.
    res.setHeader('Cache-Control', 'no-store')
    res.end(code)
  }

  const assetHashOf = (rec: ArtifactRecord): string | null =>
    rec.builtRef ? rec.builtRef.replace('store://assets/', '') : null

  return {
    name: 'generative-ui-frame-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const query = new URLSearchParams((req.url || '').split('?')[1] || '')
        const appOrigin = `http://${req.headers.host}`

        try {
          // ---- MCP server: generative UI over MCP for external hosts (§11) ----
          if (url === '/mcp') {
            await seedFixtures()
            await handleMcp(req, res)
            return
          }

          // ---- Library list: every stored artifact (fixtures + authored) ----
          if (req.method === 'GET' && url === '/api/frame/list') {
            await seedFixtures()
            const artifacts = (await store.list()).map((r) => ({
              artifactId: r.artifactId,
              revision: r.revision,
              title: r.title,
              kind: r.kind,
              driver: r.provenance.driver,
            }))
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ artifacts }))
            return
          }

          // ---- Pinned runtime modules (§4.1) -------------------------------
          const rt = url.match(/^\/sandbox\/_runtime\/[^/]+\/(.+)$/)
          if (req.method === 'GET' && rt) {
            const code = await bundleRuntime(rt[1]!)
            if (code == null) {
              res.statusCode = 404
              res.end(`// unknown runtime module: ${rt[1]}`)
              return
            }
            sendJs(res, code)
            return
          }

          // ---- Pinned built bundles (§3.2) ---------------------------------
          const asset = url.match(/^\/sandbox\/_assets\/(.+)$/)
          if (req.method === 'GET' && asset) {
            await seedFixtures()
            const code = await store.getBuilt(asset[1]!)
            if (code == null) {
              res.statusCode = 404
              res.end('// unknown asset')
              return
            }
            sendJs(res, code)
            return
          }

          // ---- Shell document for a pinned revision (§5) -------------------
          const shell = url.match(/^\/sandbox\/([^/]+)\/(\d+)$/)
          if (req.method === 'GET' && shell) {
            await seedFixtures()
            const rec = await store.get(shell[1]!, Number(shell[2]))
            if (!rec) {
              res.statusCode = 404
              res.end('Unknown artifact revision')
              return
            }
            const instanceId = query.get('i') || `inst_${rec.artifactId}`
            const nonce = randomBytes(12).toString('base64url')
            const hash = assetHashOf(rec)
            const html = buildShellDocument({
              record: rec,
              instanceId,
              appOrigin,
              theme: SERVER_THEME,
              registry,
              builtUrl: hash ? `/sandbox/_assets/${hash}` : undefined,
              props: { data: rec.data },
              nonce,
            })
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.setHeader('Content-Security-Policy', buildCsp({ kind: rec.kind, appOrigin, connectGrants: rec.networkGrants, nonce }))
            res.setHeader('X-Content-Type-Options', 'nosniff')
            res.setHeader('Referrer-Policy', 'no-referrer')
            res.setHeader('Cache-Control', 'private, no-store')
            res.end(html)
            return
          }

          // ---- Standalone artifact page (§4.1, a library surface) ----------
          const page = url.match(/^\/a\/([^/]+)$/)
          if (req.method === 'GET' && page) {
            await seedFixtures()
            const rec = await store.latest(page[1]!)
            if (!rec) {
              res.statusCode = 404
              res.end('Unknown artifact')
              return
            }
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(standalonePage(rec))
            return
          }
        } catch (err: any) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err?.message ?? String(err) }))
          return
        }

        next()
      })
    },
  }
}

/** Minimal standalone page: host chrome + the sandboxed frame (§4.1). */
function standalonePage(rec: ArtifactRecord): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(rec.title)}</title>
<style>body{margin:0;font:14px ui-sans-serif,system-ui;background:#f1f5f9;color:#0f172a}
.wrap{max-width:720px;margin:40px auto;padding:0 20px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden}
.bar{padding:10px 14px;border-bottom:1px solid #eef2f7;font-size:12px;color:#64748b;display:flex;gap:8px}
iframe{display:block;width:100%;border:0;min-height:420px}</style></head>
<body><div class="wrap"><h1>${esc(rec.title)}</h1>
<p style="color:#64748b">Open Generative UI · Tier F artifact · revision ${rec.revision} · ${rec.kind}</p>
<div class="card"><div class="bar"><span>▢</span><span>${esc(rec.title)}</span><span style="margin-left:auto">sandboxed</span></div>
<iframe src="/sandbox/${rec.artifactId}/${rec.revision}?i=page" sandbox="allow-scripts"></iframe></div></div></body></html>`
}
