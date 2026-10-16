/**
 * Tier F serving layer for the POC host (Draft 0.2 §4, §5, §7.3.3), as Vite dev
 * middleware. Implements the reference host's responsibilities:
 *
 * - build-at-write-time: esbuild transforms react-tsx sources to ESM when an
 *   artifact is created (§7.3.3); the frame loads only the built bundle.
 * - the sandbox routes (§4.1): shell document, pinned built assets, pinned
 *   runtime modules, and a standalone artifact page.
 * - response CSP + hardening headers (§4.3, §9).
 *
 * Single-origin POC caveat: a production host serves `/sandbox/*` from a
 * dedicated origin (§4.2); here the iframe's `sandbox="allow-scripts"` (no
 * allow-same-origin) still yields an opaque origin, so the frame cannot reach
 * app cookies/DOM — but same-origin isolation is weaker than §4.2 requires.
 */

import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { transformWithEsbuild, type Plugin } from 'vite'
import {
  InMemoryArtifactStore,
  REFERENCE_REGISTRY,
  buildCsp,
  buildShellDocument,
  createArtifactTools,
  makeReactBuilder,
  FRAME_FIXTURES,
  type ArtifactRecord,
  type FrameTheme,
} from '@tanstack/ai-generative-ui'
import { RUNTIME_NPM, RUNTIME_SHIMS } from './frame-runtime'

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

// The esbuild-backed builder: TSX → ESM, imports left as bare specifiers for
// the shell's import map. Build errors become structured tool results (§7.3.3).
const reactBuilder = makeReactBuilder(async ({ source }) => {
  // Classic JSX (React.createElement) so artifacts need only `react` — not
  // `react/jsx-runtime` (whose standalone bundle would re-import itself, since
  // esbuild externalizes subpaths of an external package). React is injected
  // when the source doesn't already import it.
  const hasReact = /\bimport\s+(\*\s+as\s+)?React\b/.test(source)
  const prepared = hasReact ? source : `import * as React from 'react';\n${source}`
  try {
    const out = await transformWithEsbuild(prepared, 'artifact.tsx', {
      loader: 'tsx',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      format: 'esm',
      target: 'es2020',
      logLevel: 'silent',
    })
    return { code: out.code }
  } catch (err: any) {
    const e = err?.errors?.[0]
    return { error: e?.text ?? String(err), line: e?.location?.line, column: e?.location?.column }
  }
})

function readJsonBody(req: any): Promise<any> {
  return new Promise((res) => {
    let s = ''
    req.on('data', (c: Buffer) => (s += c))
    req.on('end', () => {
      try {
        res(JSON.parse(s || '{}'))
      } catch {
        res({})
      }
    })
  })
}

export function frameApiPlugin(): Plugin {
  const store = new InMemoryArtifactStore()
  const exampleRoot = resolve(import.meta.dirname, '..')
  // Authoritative data per artifact (react-tsx props.data / host.init.data).
  const artifactData = new Map<string, unknown>()
  const fixtureIndex: Array<{ fixtureId: string; artifactId: string; revision: number; title: string; kind: string }> = []
  const runtimeCache = new Map<string, string>()

  const tools = createArtifactTools({
    store,
    builder: reactBuilder,
    registry: REFERENCE_REGISTRY,
    ownerId: 'poc',
    provenance: { driver: 'fixture' },
  })

  // Seed the canonical fixtures once (build happens here, at write time).
  let seeded: Promise<void> | null = null
  const ensureSeeded = () => {
    if (!seeded) {
      seeded = (async () => {
        for (const fx of Object.values(FRAME_FIXTURES)) {
          const res = await tools.create({ kind: fx.kind, title: fx.title, source: fx.source, fallbackText: fx.fallbackText, data: fx.data })
          if ('artifactId' in res) {
            if (fx.data !== undefined) artifactData.set(res.artifactId, fx.data)
            fixtureIndex.push({ fixtureId: fx.id, artifactId: res.artifactId, revision: res.revision, title: fx.title, kind: fx.kind })
          } else {
            console.error(`[frame] fixture ${fx.id} failed to build:\n${res.buildLog}`)
          }
        }
      })()
    }
    return seeded
  }

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

  const sendJs = (res: any, code: string, _immutable = false) => {
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

  function assetHashOf(rec: ArtifactRecord): string | null {
    return rec.builtRef ? rec.builtRef.replace('store://assets/', '') : null
  }

  return {
    name: 'generative-ui-frame-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const query = new URLSearchParams((req.url || '').split('?')[1] || '')
        const appOrigin = `http://${req.headers.host}`

        try {
          // ---- Library list (seed on first touch) --------------------------
          if (req.method === 'GET' && url === '/api/frame/list') {
            await ensureSeeded()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ artifacts: fixtureIndex }))
            return
          }

          // ---- Create / revise (agent-facing, §8.1) ------------------------
          if (req.method === 'POST' && (url === '/api/frame/create' || url === '/api/frame/revise')) {
            await ensureSeeded()
            const body = await readJsonBody(req)
            const result = url === '/api/frame/create' ? await tools.create(body) : await tools.revise(body)
            if ('artifactId' in result && body.data !== undefined) artifactData.set(result.artifactId, body.data)
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 'error' in result ? 422 : 200
            res.end(JSON.stringify(result))
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
            sendJs(res, code, true)
            return
          }

          // ---- Pinned built bundles (§3.2) ---------------------------------
          const asset = url.match(/^\/sandbox\/_assets\/(.+)$/)
          if (req.method === 'GET' && asset) {
            await ensureSeeded()
            const code = store.blobs.get(asset[1]!)
            if (code == null) {
              res.statusCode = 404
              res.end('// unknown asset')
              return
            }
            sendJs(res, code, true)
            return
          }

          // ---- Shell document for a pinned revision (§5) -------------------
          const shell = url.match(/^\/sandbox\/([^/]+)\/(\d+)$/)
          if (req.method === 'GET' && shell) {
            await ensureSeeded()
            const rec = store.get(shell[1]!, Number(shell[2]))
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
              registry: REFERENCE_REGISTRY,
              builtUrl: hash ? `/sandbox/_assets/${hash}` : undefined,
              props: { data: artifactData.get(rec.artifactId) },
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
            await ensureSeeded()
            const rec = store.latest(page[1]!)
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
