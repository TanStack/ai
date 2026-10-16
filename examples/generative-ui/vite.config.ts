import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {
  LiveDriver,
  validateGraph,
  renderUICompositionGuidance,
  type GraphDocument,
} from '@tanstack/ai-generative-ui'
import { frameApiPlugin } from './server/frame-plugin'

// Load .env.local if present
for (const envFile of ['.env.local', '.env']) {
  const p = resolve(import.meta.dirname, envFile)
  if (existsSync(p)) {
    process.loadEnvFile(p)
  }
}

// Shared catalog/compute/wiring rules (one source of truth in the package),
// reused by the one-shot generator (§7.3) and the conversational surface
// (§1 principle 6, §15.1) — and by the Goose MCP producer.
const CATALOG_RULES = renderUICompositionGuidance()

const SYSTEM_PROMPT = `You are an Open Generative UI agent complying with Open Generative UI Specification (Draft 0.1).
When given a user request, you MUST call the "render_ui" tool to produce a declarative node graph.

Ground Rules:
1. Always call the "render_ui" tool. Never return plain prose when UI is requested.
2. ${CATALOG_RULES}
3. Set revision to 1.`

// Conversational surface. The graph is MESSAGE CONTENT in a chat stream
// (§1 principle 6): the model narrates briefly in markdown AND composes UI
// inline. Follow-ups revise an already-rendered graph in place by reusing its
// graphId and incrementing revision (§1, §5.1).
const CHAT_SYSTEM_PROMPT = `You are an Open Generative UI agent speaking inside a chat conversation, complying with Open Generative UI Specification (Draft 0.1).

You are "talking" in a richer medium. Each turn you:
- reply with a short, warm sentence or two of plain markdown prose (no headings, no walls of text), AND
- when an interactive interface would genuinely serve the request, ALSO call the "render_ui" tool so the UI renders inline as part of your message.

When to render UI: comparisons, calculators/parameter explorers, plans/checklists, forms, approvals, dashboards, maps, and diagrams. For a purely conversational question, just answer in prose and do not call the tool.

NEVER put a UI graph, JSON, or a \`\`\`json code block in your text reply. The graph goes ONLY in the "render_ui" tool call. Your text is a human sentence to the user, nothing else.

Revising in place: your earlier "render_ui" tool calls in this conversation are the UIs currently on screen. If the user asks to change, tweak, extend, or correct one, call "render_ui" AGAIN reusing that SAME graphId and setting revision to the previous revision + 1 — do not invent a new graphId, and do not describe the change in text instead of calling the tool. Only use a brand-new graphId for a genuinely new, unrelated interface. When you revise, keep your prose to a brief note of what changed.

UI composition rules:
${CATALOG_RULES}
Set revision to 1 for a new graph, or previous revision + 1 when revising an existing one.`

const MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  gemini: 'gemini-3.8-flash',
  xai: 'grok-4.20-0309-non-reasoning',
  anthropic: 'claude-sonnet-4-5-20250929',
  openrouter: 'openai/gpt-4o',
}

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  graph?: GraphDocument | null
}

interface ProviderResult {
  text: string
  rawGraph: unknown
}

// A prior graph belongs in the history as a real render_ui tool CALL, not as
// JSON inside assistant text. Embedding the graph as fenced text taught the
// model to reply in that same textual format (and dump JSON into the chat)
// instead of calling the tool. A stable id ties each call to its result.
const toolCallId = (g: GraphDocument) => `render_${g.graphId}_${g.revision}`.replace(/[^A-Za-z0-9_]/g, '_')

function buildAnthropicMessages(turns: ChatTurn[]): any[] {
  const msgs: any[] = []
  for (const t of turns) {
    if (t.role === 'assistant' && t.graph) {
      const id = toolCallId(t.graph)
      const content: any[] = []
      if (t.content) content.push({ type: 'text', text: t.content })
      content.push({ type: 'tool_use', id, name: 'render_ui', input: t.graph })
      msgs.push({ role: 'assistant', content })
      msgs.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'UI rendered to the user.' }] })
    } else {
      msgs.push({ role: t.role, content: t.content || '' })
    }
  }
  return msgs
}

function buildOpenAIMessages(system: string, turns: ChatTurn[]): any[] {
  const msgs: any[] = [{ role: 'system', content: system }]
  for (const t of turns) {
    if (t.role === 'assistant' && t.graph) {
      const id = toolCallId(t.graph)
      msgs.push({
        role: 'assistant',
        content: t.content || null,
        tool_calls: [{ id, type: 'function', function: { name: 'render_ui', arguments: JSON.stringify(t.graph) } }],
      })
      msgs.push({ role: 'tool', tool_call_id: id, content: 'UI rendered to the user.' })
    } else {
      msgs.push({ role: t.role, content: t.content || '' })
    }
  }
  return msgs
}

/**
 * Single place that talks to each provider. `toolChoice: 'required'` forces a
 * render_ui call (one-shot generator); `'auto'` lets the model interleave
 * prose and an optional tool call (conversational surface). Prior graphs ride
 * the history as render_ui tool calls so the model keeps calling the tool.
 */
async function callProvider(
  provider: string,
  system: string,
  turns: ChatTurn[],
  toolChoice: 'required' | 'auto',
): Promise<ProviderResult> {
  const toolDef = LiveDriver.getRenderToolDefinition()
  const model = MODELS[provider]
  if (!model) throw new Error(`Unknown or unsupported provider: ${provider}`)

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured in .env.local')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: buildAnthropicMessages(turns),
        tools: [
          {
            name: toolDef.name,
            description: toolDef.description,
            input_schema: toolDef.parameters,
          },
        ],
        tool_choice: toolChoice === 'required' ? { type: 'tool', name: 'render_ui' } : { type: 'auto' },
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic error (${response.status}): ${await response.text()}`)
    }

    const json = await response.json()
    const blocks: any[] = Array.isArray(json.content) ? json.content : []
    const text = blocks
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('')
      .trim()
    const toolUse = blocks.find((c) => c.type === 'tool_use')
    return { text, rawGraph: toolUse?.input ?? null }
  }

  // OpenAI-compatible providers (openai, gemini, xai, openrouter)
  const endpoints: Record<string, string> = {
    openai: 'https://api.openai.com/v1/chat/completions',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    xai: 'https://api.x.ai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  }
  const keyNames: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    gemini: 'GEMINI_API_KEY',
    xai: 'XAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  }
  const apiKey = process.env[keyNames[provider]!]
  if (!apiKey) throw new Error(`${keyNames[provider]} not configured in .env.local`)

  const response = await fetch(endpoints[provider]!, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: buildOpenAIMessages(system, turns),
      tools: [{ type: 'function', function: toolDef }],
      tool_choice: toolChoice === 'required' ? { type: 'function', function: { name: 'render_ui' } } : 'auto',
    }),
  })

  if (!response.ok) {
    throw new Error(`${provider} error (${response.status}): ${await response.text()}`)
  }

  const json = await response.json()
  const message = json.choices?.[0]?.message
  const text = typeof message?.content === 'string' ? message.content.trim() : ''
  const toolCall = message?.tool_calls?.[0]
  const argsStr = toolCall?.function?.arguments
  const rawGraph = typeof argsStr === 'string' ? JSON.parse(argsStr) : (argsStr ?? null)
  return { text, rawGraph }
}

// Safety net: even with tool-call history, a model may still dump a graph as
// text. Recover a graph from a fenced ```json block, and strip any leaked
// "[UI currently on screen …]" marker or graph fence from the shown prose.
function extractGraphFromText(text: string): unknown {
  if (!text) return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1] : null
  if (!candidate) return null
  try {
    const obj = JSON.parse(candidate)
    if (obj && typeof obj === 'object' && (obj as any).specVersion && (obj as any).root) return obj
  } catch {
    // not JSON — leave as prose
  }
  return null
}

function sanitizeAssistantText(text: string, strippedGraph: boolean): string {
  let t = text || ''
  // Drop any leaked on-screen marker the model may have echoed.
  t = t.replace(/\[UI currently on screen[\s\S]*?\]/gi, '')
  // If we pulled a graph out of the text, remove the raw code block too.
  if (strippedGraph) t = t.replace(/```(?:json)?\s*[\s\S]*?```/g, '')
  return t.trim()
}

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolvePromise) => {
    let bodyStr = ''
    req.on('data', (chunk: Buffer) => {
      bodyStr += chunk
    })
    req.on('end', () => {
      try {
        resolvePromise(JSON.parse(bodyStr || '{}'))
      } catch {
        resolvePromise({})
      }
    })
  })
}

function generativeUiApiPlugin(): Plugin {
  return {
    name: 'generative-ui-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method === 'GET' && req.url === '/api/providers') {
          const providers = []
          if (process.env.OPENAI_API_KEY) providers.push('openai')
          if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic')
          if (process.env.GEMINI_API_KEY) providers.push('gemini')
          if (process.env.XAI_API_KEY) providers.push('xai')
          if (process.env.OPENROUTER_API_KEY) providers.push('openrouter')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ providers }))
          return
        }

        // One-shot generator — kept for the Playground test bench.
        if (req.method === 'POST' && req.url === '/api/generate') {
          try {
            const { prompt, provider = 'openai' } = await readJsonBody(req)
            if (!prompt) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Missing prompt' }))
              return
            }

            const { rawGraph } = await callProvider(
              provider,
              SYSTEM_PROMPT,
              [{ role: 'user', content: prompt }],
              'required',
            )
            if (!rawGraph) throw new Error('Model did not return a valid render_ui tool call')

            const validation = validateGraph(rawGraph, { repair: true })
            const graph = validation.valid && validation.graph ? validation.graph : LiveDriver.processModelOutput(rawGraph)

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ graph, repairs: validation.repairs }))
          } catch (err: any) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }

        // Conversational surface — graph is inline message content (§15.1).
        if (req.method === 'POST' && req.url === '/api/chat') {
          try {
            const { messages = [], provider = 'openai' } = await readJsonBody(req)
            if (!Array.isArray(messages) || messages.length === 0) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Missing messages' }))
              return
            }

            const result = await callProvider(provider, CHAT_SYSTEM_PROMPT, messages, 'auto')

            // Prefer the tool call; fall back to a graph the model text-dumped.
            let rawGraph = result.rawGraph
            const recoveredFromText = !rawGraph && extractGraphFromText(result.text)
            if (recoveredFromText) rawGraph = recoveredFromText
            const text = sanitizeAssistantText(result.text, Boolean(recoveredFromText))

            let graph: GraphDocument | null = null
            let repairs: string[] = []
            if (rawGraph) {
              const validation = validateGraph(rawGraph, { repair: true })
              graph = validation.valid && validation.graph ? validation.graph : LiveDriver.processModelOutput(rawGraph)
              repairs = validation.repairs
            }

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ text, graph, repairs }))
          } catch (err: any) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), generativeUiApiPlugin(), frameApiPlugin()],
  server: {
    port: 3000,
  },
})
