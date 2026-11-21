/**
 * A2UI chat endpoint. Mirrors /api/chat, but the model drives UI by emitting
 * A2UI v0.9 operations through the `a2ui_ops` tool instead of render_ui. The
 * client collects those operations into a persistent `A2uiSurfaceStore`, so the
 * model can create a surface and then mutate it across turns ("add a row",
 * "now make it a chart") — the parallel ingress, driven by a live agent.
 *
 * The tool just acks server-side; its arguments ARE the payload (like render_ui).
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

const MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5-20250929',
}

function adapterFor(provider: string) {
  if (provider === 'anthropic') return anthropicText(MODELS.anthropic as any)
  return openaiText(MODELS.openai as any)
}

const SYSTEM_PROMPT = `You build and update UI by emitting A2UI v0.9 operations through the a2ui_ops tool. Reply with ONE short sentence of prose, and call a2ui_ops with the operations that create or change the surface. Never put JSON in your prose.

OPERATIONS (nested v0.9 shape — dispatch on the key):
- { "version": "v0.9", "createSurface": { "surfaceId": "<id>", "catalogId": "basic", "root": "<rootComponentId>" } }
- { "version": "v0.9", "updateComponents": { "surfaceId": "<id>", "components": [ ...A2UI components... ] } }
- { "version": "v0.9", "updateDataModel": { "surfaceId": "<id>", "path": "/<jsonPointer>", "value": <any> } }
- { "version": "v0.9", "deleteSurface": { "surfaceId": "<id>" } }

Each component is a flat object with a unique "id" and a "component" type; containers reference children by id. Exactly one component is the root. Catalog:
- Column { children: [ids] }         vertical stack
- Row { children: [ids] }            horizontal columns (<=4)
- Card { child: id }                 bordered section
- List { children: [textIds] }       bulleted list of Text
- Tabs { tabItems: [{ title, child: id }] }
- Text { text: string, usageHint?: "h1".."h5" | "caption" }
- Image { url: string }
- Button { child: textId, variant?: "primary"|"secondary"|"danger", action?: { event: { name, context? } } }
- TextField { label, textFieldType?: "text"|"number", value?: binding }
- CheckBox { label }
- ChoicePicker { label, options: [{value,label}] }
- Slider { label, minValue, maxValue, value?: binding }
- Metric { label, value, trend?: "+5%", tone?: "positive"|"negative"|"neutral" }
- BarChart | PieChart { title, data: [{ label, value }] }
- DataTable { columns: [{ key, label }], rows: [{ ... }] }

BINDINGS: any prop value may be { "path": "/pointer" } to read from the surface's data model; fill the model with updateDataModel. Prefer bindings + updateDataModel for values that change.

RULES:
- To CREATE a surface: createSurface, then updateComponents (and updateDataModel for data). Use a fresh surfaceId.
- To UPDATE the surface the user is looking at: emit updateComponents / updateDataModel with the SAME surfaceId. Re-send a component (same id) to replace it.
- You may put several operations in one a2ui_ops call. Batch create + components + data together.

EXAMPLE — a flight card:
a2ui_ops({ "operations": [
  { "version":"v0.9", "createSurface": { "surfaceId":"flight", "catalogId":"basic", "root":"card" } },
  { "version":"v0.9", "updateComponents": { "surfaceId":"flight", "components": [
    { "id":"card", "component":"Card", "child":"col" },
    { "id":"col", "component":"Column", "children":["title","route","book"] },
    { "id":"title", "component":"Text", "text":"Flight Details", "usageHint":"h3" },
    { "id":"route", "component":"Row", "children":["from","to"] },
    { "id":"from", "component":"Text", "text": { "path":"/origin" }, "usageHint":"h4" },
    { "id":"to", "component":"Text", "text": { "path":"/destination" }, "usageHint":"h4" },
    { "id":"book", "component":"Button", "child":"bookLabel", "variant":"primary", "action": { "event": { "name":"book_flight" } } },
    { "id":"bookLabel", "component":"Text", "text":"Book" }
  ] } },
  { "version":"v0.9", "updateDataModel": { "surfaceId":"flight", "path":"/", "value": { "origin":"PDX", "destination":"SFO" } } }
] })`

function a2uiOpsTool() {
  return toolDefinition({
    name: 'a2ui_ops',
    description:
      'Emit a batch of A2UI v0.9 operations to create or update the surface shown to the user. The operations ARE the payload.',
    // Raw JSON Schema (like render_ui's parameters) — no zod dependency.
    inputSchema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'A2UI v0.9 operations, in order',
          items: { type: 'object' },
        },
      },
      required: ['operations'],
    },
  }).server(async () => ({ applied: true }))
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

/** Handle POST /api/a2ui-chat: run chat() with the a2ui_ops tool, stream SSE. */
export async function handleA2uiChat(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req)
  const params = await chatParamsFromRequestBody(body)
  const provider =
    typeof params.forwardedProps?.provider === 'string'
      ? params.forwardedProps.provider
      : 'openai'

  const abortController = new AbortController()
  req.on('close', () => abortController.abort())

  const stream = chat({
    adapter: adapterFor(provider),
    systemPrompts: [SYSTEM_PROMPT],
    agentLoopStrategy: maxIterations(6),
    tools: [a2uiOpsTool()],
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
