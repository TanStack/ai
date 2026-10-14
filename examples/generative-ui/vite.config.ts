import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { LiveDriver, validateGraph, describeComputeForPrompt } from '@tanstack/ai-generative-ui'

// Load .env.local if present
for (const envFile of ['.env.local', '.env']) {
  const p = resolve(import.meta.dirname, envFile)
  if (existsSync(p)) {
    process.loadEnvFile(p)
  }
}

const SYSTEM_PROMPT = `You are an Open Generative UI agent complying with Open Generative UI Specification (Draft 0.1).
When given a user request, you MUST call the "render_ui" tool to produce a declarative node graph.

Ground Rules:
1. Always call the "render_ui" tool. Never return plain prose when UI is requested.
2. The UI graph must be composed only from catalog components:
   - Layout: Stack, Columns, Section, Tabs, Timeline
   - Content: Text, Image, Table, List, Metric, Chart, Map, Diagram, Callout
   - Input: Form, TextInput, NumberInput, Select, Slider, Stepper, Toggle, Checkbox, Checklist, Button, Choice
   - Vector Scene: Scene (props must include "viewBox", e.g. "0 0 300 360", and "shapes": Array<{ kind: "rect"|"circle"|"line"|"text"|"path", ... }>. ALWAYS put vector shapes inside props.shapes, not in children. Use semantic paint roles: "accent", "neutral", "muted", "surface", "danger", "highlight", or "none")
3. Safety: No arbitrary HTML, scripts, CSS strings, or execution handlers.
4. Deterministic computation: If values are computed (e.g. loan payments, bill splits, taxes), DO NOT author arithmetic in text and DO NOT require a button click. Attach a REACTIVE "compute" to a CONTAINER node (Stack/Section/Form) so results update live as inputs change. Shape: "compute": { "name", "inputs": { fnInput: "stateKey" }, "output": "resultKey" }. Only use functions from this list — inventing a name means nothing computes:
${describeComputeForPrompt()}
   Wiring rules:
   - Give every input (NumberInput/Slider/etc.) an explicit "bind": { "value": "someKey" } and set its starting number via props.value. Reference that SAME "someKey" in the compute inputs.
   - A compute output that is an object is written at output + flattened to the root. A Metric shows a computed number via "bind": { "value": "resultKey.fieldName" } (e.g. output "loan" -> Metric bind.value "loan.monthlyPayment"). Do not put the number in props.value.
   - Button/label text goes in the "label" prop (not "text").
5. Provide a meaningful, accessible "fallbackText" summarizing the interface for non-visual surfaces.
6. Set specVersion to "0.1", revision to 1, and provenance.driver to "live".`

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

        if (req.method === 'POST' && req.url === '/api/generate') {
          let bodyStr = ''
          req.on('data', (chunk) => {
            bodyStr += chunk
          })
          req.on('end', async () => {
            try {
              const { prompt, provider = 'openai' } = JSON.parse(bodyStr || '{}')
              if (!prompt) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Missing prompt' }))
                return
              }

              const toolDef = LiveDriver.getRenderToolDefinition()
              let rawGraph: unknown = null

              if (provider === 'openai') {
                const apiKey = process.env.OPENAI_API_KEY
                if (!apiKey) throw new Error('OPENAI_API_KEY not configured in .env.local')

                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                      { role: 'system', content: SYSTEM_PROMPT },
                      { role: 'user', content: prompt },
                    ],
                    tools: [{ type: 'function', function: toolDef }],
                    tool_choice: { type: 'function', function: { name: 'render_ui' } },
                  }),
                })

                if (!response.ok) {
                  const errText = await response.text()
                  throw new Error(`OpenAI error (${response.status}): ${errText}`)
                }

                const json = await response.json()
                const toolCall = json.choices?.[0]?.message?.tool_calls?.[0]
                const argsStr = toolCall?.function?.arguments
                rawGraph = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr
              } else if (provider === 'gemini') {
                const apiKey = process.env.GEMINI_API_KEY
                if (!apiKey) throw new Error('GEMINI_API_KEY not configured in .env.local')

                const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'gemini-3.8-flash',
                    messages: [
                      { role: 'system', content: SYSTEM_PROMPT },
                      { role: 'user', content: prompt },
                    ],
                    tools: [{ type: 'function', function: toolDef }],
                    tool_choice: { type: 'function', function: { name: 'render_ui' } },
                  }),
                })

                if (!response.ok) {
                  const errText = await response.text()
                  throw new Error(`Gemini error (${response.status}): ${errText}`)
                }

                const json = await response.json()
                const toolCall = json.choices?.[0]?.message?.tool_calls?.[0]
                const argsStr = toolCall?.function?.arguments
                rawGraph = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr
              } else if (provider === 'xai') {
                const apiKey = process.env.XAI_API_KEY
                if (!apiKey) throw new Error('XAI_API_KEY not configured in .env.local')

                const response = await fetch('https://api.x.ai/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'grok-4.20-0309-non-reasoning',
                    messages: [
                      { role: 'system', content: SYSTEM_PROMPT },
                      { role: 'user', content: prompt },
                    ],
                    tools: [{ type: 'function', function: toolDef }],
                    tool_choice: { type: 'function', function: { name: 'render_ui' } },
                  }),
                })

                if (!response.ok) {
                  const errText = await response.text()
                  throw new Error(`xAI error (${response.status}): ${errText}`)
                }

                const json = await response.json()
                const toolCall = json.choices?.[0]?.message?.tool_calls?.[0]
                const argsStr = toolCall?.function?.arguments
                rawGraph = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr
              } else if (provider === 'anthropic') {
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
                    model: 'claude-sonnet-4-5-20250929',
                    max_tokens: 4096,
                    system: SYSTEM_PROMPT,
                    messages: [{ role: 'user', content: prompt }],
                    tools: [
                      {
                        name: toolDef.name,
                        description: toolDef.description,
                        input_schema: toolDef.parameters,
                      },
                    ],
                    tool_choice: { type: 'tool', name: 'render_ui' },
                  }),
                })

                if (!response.ok) {
                  const errText = await response.text()
                  throw new Error(`Anthropic error (${response.status}): ${errText}`)
                }

                const json = await response.json()
                const toolUse = json.content?.find((c: any) => c.type === 'tool_use')
                rawGraph = toolUse?.input
              } else if (provider === 'openrouter') {
                const apiKey = process.env.OPENROUTER_API_KEY
                if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured in .env.local')

                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'openai/gpt-4o',
                    messages: [
                      { role: 'system', content: SYSTEM_PROMPT },
                      { role: 'user', content: prompt },
                    ],
                    tools: [{ type: 'function', function: toolDef }],
                    tool_choice: { type: 'function', function: { name: 'render_ui' } },
                  }),
                })

                if (!response.ok) {
                  const errText = await response.text()
                  throw new Error(`OpenRouter error (${response.status}): ${errText}`)
                }

                const json = await response.json()
                const toolCall = json.choices?.[0]?.message?.tool_calls?.[0]
                const argsStr = toolCall?.function?.arguments
                rawGraph = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr
              } else {
                throw new Error(`Unknown or unsupported provider: ${provider}`)
              }

              if (!rawGraph) {
                throw new Error('Model did not return a valid render_ui tool call')
              }

              // Run through Bounded Repair & Schema Validation (§9.3, §7.3)
              const validation = validateGraph(rawGraph, { repair: true })
              const graph = validation.valid && validation.graph ? validation.graph : LiveDriver.processModelOutput(rawGraph)

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ graph, repairs: validation.repairs }))
            } catch (err: any) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: err.message }))
            }
          })
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), generativeUiApiPlugin()],
  server: {
    port: 3000,
  },
})
