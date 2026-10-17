/**
 * Conversational chat endpoint, migrated to `@tanstack/ai` `chat()` with a real
 * server-side agent loop. The model composes Tier N catalog graphs via the
 * `render_ui` tool (args carry the graph; a no-op server ack keeps the loop
 * moving) and authors Tier F artifacts via the `generativeUiArtifacts`
 * middleware's `create_artifact`/`revise_artifact`/… tools — built + stored
 * server-side, streamed back, and rendered inline. SSE is hand-pumped from the
 * web `Response` into the raw Node response (this is Vite dev middleware).
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { generativeUiArtifacts } from '@tanstack/ai-generative-ui/artifacts'
import {
  LiveDriver,
  buildFragmentDocument,
  describeDataSourcesForPrompt,
  describeRegistryForPrompt,
  renderUICompositionGuidance,
  type FrameTheme,
} from '@tanstack/ai-generative-ui'
import { getFragmentGuestScript, reactBuilder, registry, store } from './frame-host'
import { dataSources } from './data-sources'

// Light theme injected into html-fragment MCP-Apps documents (fragments also
// carry var() fallbacks). A dedicated sandbox origin can't read the host's CSS.
const FRAGMENT_THEME: FrameTheme = {
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

const MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5-20250929',
}

function adapterFor(provider: string) {
  if (provider === 'anthropic') return anthropicText(MODELS.anthropic as any)
  return openaiText(MODELS.openai as any)
}

const SYSTEM_PROMPT = `You are an Open Generative UI agent speaking in a chat conversation (Open Generative UI, Draft 0.2).

Each turn: reply with a short, warm sentence or two of plain markdown prose, AND — when an interactive interface would genuinely serve the request — call ONE tool so the UI renders inline as part of your message. For a purely conversational question, just answer in prose.

You have two ways to render UI:

1. render_ui — compose a declarative catalog node graph (Tier N). Best for comparisons, forms, approvals, checklists, metrics, and simple dashboards: testable and host-native. Follow the catalog + compute rules below.

2. create_artifact — author a bespoke Frame-tier artifact (Tier F) when craft and interactivity dominate: domain figures (a guitar chord card, an annotated diagram), rich calculators, or data tables/charts. Choose kind:
   - "html-fragment": markup + optional <style>/<script>, hand-tuned inline SVG. Great for domain figures.
   - "react-tsx": one TSX module whose default export is a component. You may import ONLY the registry modules listed below.
   Numbers presented as computed must come from host-provided data (the create_artifact "data" field), not from arithmetic you write. If a build fails, you will receive the errors as the tool result — fix the source and call create_artifact again.
   For a view that should update in real time (a monitor, a ticker, a dashboard that changes on its own), bind it to a live data source with the create_artifact "dataSource" field ({ name, params }) and read the streamed value with useHostData() — the host pushes new values and the view re-renders in place. Use ONLY the source names listed below. CRITICAL: useHostData() returns undefined until the first value streams in, so ALWAYS default it on the first line and read fields off the default, never off the raw call — e.g. \`const d = useHostData() || { total: 0, recent: [] }; const total = d.total || 0; const recent = d.recent || [];\`. Do not destructure the raw useHostData() result and do not call .toFixed()/.map() on fields without a fallback.

Prefer render_ui for standard comparisons/forms; prefer create_artifact for anything bespoke, hand-crafted, or library-rich. Before authoring something new, you may call list_artifacts to reuse an existing one. NEVER put a UI graph, JSON, or code in your text reply — it goes only in the tool call. The UI you create renders automatically inline; do NOT embed it, link it, or reference its id/url in your prose (no markdown images or links to the artifact). Keep your prose to one short sentence.

=== Tier N catalog + compute rules ===
${renderUICompositionGuidance()}

=== Tier F react-tsx module registry ===
${describeRegistryForPrompt(registry)}

=== Live data sources (for create_artifact "dataSource") ===
${describeDataSourcesForPrompt(dataSources)}`

function renderUiTool() {
  const def = LiveDriver.getRenderToolDefinition()
  return toolDefinition({
    name: def.name,
    description: def.description,
    inputSchema: def.parameters,
  }).server(async () => ({ rendered: true }))
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolvePromise) => {
    let s = ''
    req.on('data', (c: Buffer) => (s += c))
    req.on('end', () => {
      try {
        resolvePromise(JSON.parse(s || '{}'))
      } catch {
        resolvePromise({})
      }
    })
  })
}

/** Handle POST /api/chat: run chat() and stream SSE to the Node response. */
export async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req)
  const params = await chatParamsFromRequestBody(body)
  const provider = typeof params.forwardedProps?.provider === 'string' ? params.forwardedProps.provider : 'openai'

  const abortController = new AbortController()
  req.on('close', () => abortController.abort())

  // Built once, cached: makes html-fragment artifacts MCP-Apps-native.
  const guestScript = await getFragmentGuestScript()

  const stream = chat({
    adapter: adapterFor(provider),
    systemPrompts: [SYSTEM_PROMPT],
    agentLoopStrategy: maxIterations(8),
    middleware: [
      generativeUiArtifacts({
        store,
        builder: reactBuilder,
        registry,
        // Additive: also emit the standard MCP Apps ui-resource part for
        // html-fragment artifacts so they render through the SDK's MCPAppResource.
        emitUiResource: true,
        renderShell: (rec) => buildFragmentDocument(rec, FRAGMENT_THEME, { guestScript }),
      }),
    ],
    tools: [renderUiTool()],
    messages: params.messages as any,
    threadId: params.threadId,
    runId: params.runId,
    abortController,
  })

  const response = toServerSentEventsResponse(stream, { abortController })
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  if (!response.body) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) res.write(Buffer.from(value))
    }
  } finally {
    res.end()
  }
}
