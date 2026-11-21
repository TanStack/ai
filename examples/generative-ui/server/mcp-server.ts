/**
 * MCP server adapter (Draft 0.2 §11 / SEP-1865) — exposes generative UI over
 * the Model Context Protocol so EXTERNAL MCP Apps hosts (Claude, ChatGPT apps,
 * Goose, …) can render it. Built on the repo's own `createMCPServer`, over the
 * SAME artifact store + builder as the in-app path (`./frame-host`).
 *
 * - tool `create_artifact` — authors an html-fragment artifact; its
 *   `_meta.ui.resourceUri` links it to the `ui://genui/last` view (SEP-1865's
 *   static tool→resource linkage, so the host renders the just-generated UI).
 * - resource `ui://genui/last` — returns the latest artifact as a self-contained,
 *   MCP-Apps-native document (`text/html;profile=mcp-app`), guest adapter inlined.
 *
 * html-fragment is used because it is trivially portable (self-contained);
 * react-tsx over MCP needs a serving origin / inline-bundle variant (follow-up).
 */

import { toolDefinition } from '@tanstack/ai'
import { createMCPServer, resourceDefinition } from '@tanstack/ai-mcp/server'
import {
  buildFragmentDocument,
  type ArtifactRecord,
  type FrameTheme,
} from '@tanstack/ai-generative-ui'
import { MCP_APP_MIME_TYPE } from '@tanstack/ai-generative-ui/artifacts'
import { artifacts, getFragmentGuestScript, store } from './frame-host'

const LAST_URI = 'ui://genui/last'

const THEME: FrameTheme = {
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

// The most recently authored artifact, surfaced at ui://genui/last.
let last: { artifactId: string; revision: number } | null = null

const createArtifactTool = toolDefinition({
  name: 'create_artifact',
  description:
    'Author a bespoke, self-contained UI (a hand-tuned HTML/SVG fragment) and render it. Numbers presented as computed should come from host data, not model arithmetic.',
  // Minimal schema — kind is fixed to html-fragment for portability.
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'source', 'fallbackText'],
    properties: {
      title: {
        type: 'string',
        description: 'Short human title for the artifact.',
      },
      source: {
        type: 'string',
        description:
          'A self-contained HTML/SVG fragment: markup + optional inline <style>/<script>.',
      },
      fallbackText: {
        type: 'string',
        description:
          'Plain-text description for accessibility and degradation.',
      },
    },
  },
  // SEP-1865 linkage: the host renders ui://genui/last after this tool runs.
  metadata: { _meta: { ui: { resourceUri: LAST_URI } } },
}).server(async (args: any) => {
  const res = await artifacts.create({ ...args, kind: 'html-fragment' })
  if ('error' in res) {
    return {
      content: [
        { type: 'text' as const, text: `Build failed:\n${res.buildLog}` },
      ],
      isError: true,
    }
  }
  last = { artifactId: res.artifactId, revision: res.revision }
  return {
    content: [
      {
        type: 'text' as const,
        text: `Rendered "${args.title}" (${res.artifactId}@${res.revision}).`,
      },
    ],
  }
})

const EMPTY: ArtifactRecord = {
  artifactId: 'none',
  revision: 1,
  contentHash: '',
  kind: 'html-fragment',
  title: 'No artifact yet',
  fallbackText: 'No artifact generated yet.',
  source:
    '<p style="padding:16px;color:var(--ui-muted,#64748b)">No artifact generated yet.</p>',
  provenance: { driver: 'live' },
  ownership: { ownerId: 'mcp', scope: 'private' },
  trustTier: 'untrusted',
  createdAt: '',
}

const lastResource = resourceDefinition({
  name: 'generated-ui',
  uri: LAST_URI,
  mimeType: MCP_APP_MIME_TYPE,
}).read(async () => {
  const guestScript = await getFragmentGuestScript()
  const rec = last
    ? ((await store.get(last.artifactId, last.revision)) ?? EMPTY)
    : EMPTY
  return {
    text: buildFragmentDocument(rec, THEME, { guestScript }),
    mimeType: MCP_APP_MIME_TYPE,
  }
})

/** The generative-UI MCP server. `.fetch(request)` serves it over HTTP. */
export const mcpServer = createMCPServer({
  name: 'generative-ui',
  version: '0.2.0',
  tools: [createArtifactTool],
  resources: [lastResource],
})
