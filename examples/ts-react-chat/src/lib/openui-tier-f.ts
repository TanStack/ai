/**
 * SERVER-ONLY. Open Generative UI — Tier F (Frame) authoring over the existing
 * MCP Apps path.
 *
 * Tier F is the richest tier of the Open Generative UI design: the model
 * *authors* a bespoke, sandboxed-iframe artifact on the fly, instead of calling
 * a pre-built widget shipped by an MCP server. We implement it with ZERO new
 * protocol by reusing the MCP Apps rendering path already in `@tanstack/ai`:
 *
 *   `@tanstack/ai` emits a `ui-resource` part for ANY executed tool that
 *   carries `metadata.mcp = { uiResourceUri, serverId, serverToolName,
 *   readResource }` — it never imports `@tanstack/ai-mcp`; the metadata travels
 *   structurally on the tool (see packages/ai/.../tools/tool-calls.ts
 *   `emitUiResourceIfLinked`). So a plain local tool can produce a Tier F
 *   artifact that renders through the same `MCPAppResource` iframe.
 *
 * The tool compiles the model's authored source into a self-contained HTML
 * document and hands it back through `readResource`. html-fragment is passed
 * through a themed shell; react-tsx is compiled with esbuild and loaded in an
 * import-map shell that pulls React from a CDN.
 *
 * ponytail: the author→emit correlation uses a single per-request `pending`
 * slot read right after the tool runs. That is only race-free while tool calls
 * run one at a time, so the chat route sets `toolExecution: 'sequential'`. If
 * you ever let the model author several artifacts in one parallel batch, key
 * `pending` by a per-call id and make `uiResourceUri` unique per call.
 */
import * as esbuild from 'esbuild'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'

/** The single `ui://` resource every Tier F artifact in a request renders as. */
const VIEW_URI = 'ui://tier-f/view'

/** Matches the React major the example runs (see package.json). */
const REACT_VERSION = '19.2.3'

/** Shared iframe chrome: transparent background, system font, dark-aware. */
const STYLE = `:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;padding:12px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:transparent;color:#e5e7eb}`

/** Wrap a raw HTML fragment in a minimal themed document. */
function htmlFragmentDoc(fragment: string): string {
  // Already a full document? Render it as-is — don't nest <html> in <html>.
  if (/<!doctype|<html[\s>]/i.test(fragment)) return fragment
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>${STYLE}</style></head><body>${fragment}</body></html>`
}

/**
 * Compile a react-tsx module to ESM and load it in an import-map shell. The
 * compiled code keeps its bare `react` / `react/jsx-runtime` imports; the shell
 * resolves them from esm.sh. The artifact must `export default` its component.
 *
 * ponytail: the import map only maps `react` + `react-dom`. A model that imports
 * another package won't resolve — acceptable for the demo; widen the map (or
 * bundle) if you need more.
 */
function reactTsxDoc(compiled: string): string {
  const module = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
  const importMap = JSON.stringify({
    imports: {
      react: `https://esm.sh/react@${REACT_VERSION}`,
      'react-dom': `https://esm.sh/react-dom@${REACT_VERSION}`,
      'react-dom/client': `https://esm.sh/react-dom@${REACT_VERSION}/client`,
      'react/jsx-runtime': `https://esm.sh/react@${REACT_VERSION}/jsx-runtime`,
    },
  })
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>${STYLE}</style><script type="importmap">${importMap}</script></head><body><div id="root"></div><script type="module">
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import Artifact from '${module}'
const el = document.getElementById('root')
try { createRoot(el).render(createElement(Artifact)) }
catch (e) { el.textContent = 'Render error: ' + (e && e.message ? e.message : e) }
</script></body></html>`
}

export type ArtifactKind = 'html-fragment' | 'react-tsx'

/** Build the iframe document for an authored artifact, or a model-facing error. */
export async function buildArtifactDoc(
  kind: ArtifactKind,
  source: string,
): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  if (kind === 'html-fragment')
    return { ok: true, html: htmlFragmentDoc(source) }
  try {
    const out = await esbuild.transform(source, {
      loader: 'tsx',
      jsx: 'automatic',
      format: 'esm',
      target: 'es2020',
    })
    return { ok: true, html: reactTsxDoc(out.code) }
  } catch (err) {
    // Surface the compile error to the model so it can fix and retry.
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Create the Tier F `create_artifact` tool for one chat request. Returns a
 * fresh tool each call because it closes over a per-request `pending` slot.
 */
export function createArtifactTool() {
  let pending: string | null = null

  const definition = toolDefinition({
    name: 'create_artifact',
    description:
      'Render a bespoke Tier F UI artifact in the chat. Author a self-contained ' +
      'UI and it renders in a sandboxed iframe next to your reply. Use kind ' +
      '"html-fragment" for static/styled markup, or "react-tsx" for an ' +
      'interactive component (local React state, no network). Prefer this over ' +
      'describing UI in prose when the user wants to SEE something.',
    inputSchema: z.object({
      kind: z
        .enum(['html-fragment', 'react-tsx'])
        .describe(
          '"html-fragment" = raw HTML/CSS; "react-tsx" = a React module.',
        ),
      title: z
        .string()
        .optional()
        .describe('Short human label for the artifact.'),
      source: z
        .string()
        .describe(
          'The artifact source. For react-tsx, a module that `export default`s ' +
            'the component; import hooks from "react". For html-fragment, an ' +
            'HTML snippet (no <script> needed for static UI).',
        ),
    }),
    outputSchema: z.object({ status: z.string() }),
    metadata: {
      // Structural MCP Apps link — makes `@tanstack/ai` emit a `ui-resource`
      // part after the tool runs, reading the authored document back here.
      mcp: {
        uiResourceUri: VIEW_URI,
        serverId: 'tier-f',
        serverToolName: 'create_artifact',
        readResource: (uri: string) =>
          Promise.resolve({
            contents:
              pending && uri === VIEW_URI
                ? [{ uri, mimeType: 'text/html', text: pending }]
                : [],
          }),
      },
    },
  })

  return definition.server(async ({ kind, source }) => {
    const built = await buildArtifactDoc(kind, source)
    if (!built.ok) {
      pending = null
      return { status: `build-error: ${built.error}` }
    }
    pending = built.html
    return { status: 'rendered' }
  })
}

/** System-prompt guidance teaching the model the Tier F authoring contract. */
export const TIER_F_SYSTEM_PROMPT = `You are an Open Generative UI agent in a chat. When the user would benefit from seeing a UI — a calculator, a card, a small interactive widget, a formatted table — call the create_artifact tool to render it inline, then add a one-line reply. Do not paste large HTML or code into the chat text; put it in the artifact.

Two kinds:
- html-fragment: self-contained HTML/CSS for static or styled output. No <script> needed.
- react-tsx: a React module for interactivity. It MUST \`export default\` the component and import hooks from "react" (e.g. \`import { useState } from 'react'\`). It runs sandboxed with no network or host access — keep all state local. Only "react" and "react-dom" are available to import.

Keep artifacts compact and visually clean on a dark, transparent background.`
