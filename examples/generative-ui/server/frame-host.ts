/**
 * Shared Frame-tier host singleton. ONE async artifact store + esbuild builder,
 * imported by BOTH the chat route (where the `generativeUiArtifacts` middleware
 * writes model-authored artifacts) and the sandbox-serving plugin (which reads
 * them back) — otherwise created artifacts would 404 at `/sandbox/:id/:rev`.
 *
 * Storage is a `@tanstack/ai-persistence` BlobStore over a gitignored
 * `.data/artifacts` dir, so artifacts persist across dev restarts.
 */

import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { transformWithEsbuild } from 'vite'
import { FRAGMENT_GUEST_SOURCE, FRAME_FIXTURES, REFERENCE_REGISTRY, makeReactBuilder } from '@tanstack/ai-generative-ui'
import { createBlobArtifactStore, createFrameArtifacts } from '@tanstack/ai-generative-ui/artifacts'
import { createFsBlobStore } from './fs-blob-store'

const EXAMPLE_ROOT = resolve(import.meta.dirname, '..')
const DATA_DIR = resolve(EXAMPLE_ROOT, '.data', 'artifacts')

// esbuild (via Vite) bundler for the MCP-Apps guest adapter.
const localRequire = createRequire(import.meta.url)
let esbuildCache: any = null
function esbuildBundler(): any {
  if (!esbuildCache) esbuildCache = createRequire(localRequire.resolve('vite'))('esbuild')
  return esbuildCache
}

// Bundle the FRAGMENT_GUEST_SOURCE (ext-apps App + the window.__ogui adapter)
// into one IIFE, once, so html-fragment artifacts are MCP-Apps-native (size +
// host round-trips). Inlined ahead of the fragment by buildFragmentDocument.
let guestScript: Promise<string> | null = null
export function getFragmentGuestScript(): Promise<string> {
  if (!guestScript) {
    guestScript = (async () => {
      const r = await esbuildBundler().build({
        stdin: { contents: FRAGMENT_GUEST_SOURCE, loader: 'js', resolveDir: EXAMPLE_ROOT },
        bundle: true,
        format: 'iife',
        platform: 'browser',
        define: { 'process.env.NODE_ENV': '"production"' },
        write: false,
        legalComments: 'none',
      })
      return r.outputFiles?.[0]?.text ?? ''
    })()
  }
  return guestScript
}

/** esbuild build-at-write: TSX → ESM, classic JSX, imports left bare for the import map. */
export const reactBuilder = makeReactBuilder(async ({ source }) => {
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

export const registry = REFERENCE_REGISTRY
export const store = createBlobArtifactStore(createFsBlobStore(DATA_DIR))

/** Ops used for fixture seeding (and available to the host for scripted creates). */
export const artifacts = createFrameArtifacts({
  store,
  builder: reactBuilder,
  registry,
  ownerId: 'poc',
  provenance: { driver: 'fixture' },
})

export interface LibraryEntry {
  fixtureId?: string
  artifactId: string
  revision: number
  title: string
  kind: string
}

/**
 * Seed the canonical fixtures once per process, idempotently across restarts:
 * a fixture is only (re)built if the store has no `fixture`-provenance artifact
 * with the same title+kind. Returns the fixture library entries.
 */
let seeded: Promise<Array<LibraryEntry>> | null = null
export function seedFixtures(): Promise<Array<LibraryEntry>> {
  if (!seeded) {
    seeded = (async () => {
      const existing = await store.list()
      const byTitleKind = new Map(
        existing.filter((r) => r.provenance.driver === 'fixture').map((r) => [`${r.title}::${r.kind}`, r]),
      )
      const index: Array<LibraryEntry> = []
      for (const fx of Object.values(FRAME_FIXTURES)) {
        const found = byTitleKind.get(`${fx.title}::${fx.kind}`)
        if (found) {
          index.push({ fixtureId: fx.id, artifactId: found.artifactId, revision: found.revision, title: found.title, kind: found.kind })
          continue
        }
        const res = await artifacts.create({ kind: fx.kind, title: fx.title, source: fx.source, fallbackText: fx.fallbackText, data: fx.data, dataSource: fx.dataSource })
        if ('artifactId' in res) {
          index.push({ fixtureId: fx.id, artifactId: res.artifactId, revision: res.revision, title: fx.title, kind: fx.kind })
        } else {
          console.error(`[frame] fixture ${fx.id} failed to build:\n${res.buildLog}`)
        }
      }
      return index
    })()
  }
  return seeded
}
