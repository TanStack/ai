import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import {
  createCodeModeSystemPrompt,
  createCodeModeTool,
} from '@tanstack/ai-code-mode'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import type { AnyTextAdapter } from '@tanstack/ai'

import { allTools } from '@/lib/tools'
import { CODE_MODE_SYSTEM_PROMPT } from '@/lib/prompts'
import { reportTools } from '@/lib/reports/tools'
import { createReportBindings } from '@/lib/reports/create-report-bindings'
import { createExcalidrawBindings } from '@/lib/reports/create-excalidraw-bindings'
import {
  getExcalidrawElements,
  setExcalidrawElements,
} from '@/lib/reports/report-storage'

type Provider = 'anthropic' | 'openai' | 'gemini'

const REPORT_ID = 'excalidraw-demo'
const CANVAS_ID = 'diagram'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'anthropic':
    default:
      return anthropicText(
        (model || 'claude-sonnet-4') as 'claude-sonnet-4',
      )
  }
}

// Excalidraw-specific system prompt
const EXCALIDRAW_SYSTEM_PROMPT = `
## Diagram Builder

You are a helpful diagram assistant that creates clear, well-organized diagrams using Excalidraw.

**IMPORTANT:** A report named "excalidraw-demo" (reportId: 'excalidraw-demo') already exists with an Excalidraw canvas. Always use reportId: 'excalidraw-demo' for any report operations.

### Creating Diagrams

Inside \`execute_typescript\`, these Excalidraw functions are available:

**Reading Elements:**
- \`external_excalidraw_get_elements({})\` — returns all current elements

**Adding Elements:**
- \`external_excalidraw_add_element({ type, x, y, width?, height?, text?, backgroundColor?, strokeColor?, label? })\` — add a shape
  - Types: 'rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'text'
- \`external_excalidraw_add_template({ template, x, y, label, color? })\` — add a styled template
  - Templates: 'service' (blue rectangle), 'database' (green ellipse), 'user' (red circle), 'cloud' (purple ellipse), 'queue' (yellow rectangle)

**Connecting Elements:**
- \`external_excalidraw_connect({ fromId, toId, type?, label? })\` — connect two elements with arrow or line

**Modifying Elements:**
- \`external_excalidraw_update_element({ elementId, updates })\` — update element properties
- \`external_excalidraw_remove_element({ elementId })\` — remove an element
- \`external_excalidraw_clear({})\` — clear all elements

### Positioning Guidelines

- Start at x=100, y=100 for the first element
- Horizontal spacing: ~220-280px between elements  
- Vertical spacing: ~150px between rows
- Common layouts:
  - Left-to-right: User → Frontend → API → Database
  - Top-down: Load Balancer → Services → Data stores

### Label Guidelines

- **Keep labels SHORT** - 1-2 words max (e.g., "Frontend", "API Server", "Database")
- Do NOT include technology names in parentheses - they will be clipped
- Use connection labels for protocols (e.g., "REST", "SQL", "HTTP")

### Example: Web App Architecture

\`\`\`typescript
// Add components using templates with SHORT labels
const frontend = await external_excalidraw_add_template({ 
  template: 'service', x: 100, y: 200, label: 'Frontend' 
})
const api = await external_excalidraw_add_template({ 
  template: 'service', x: 380, y: 200, label: 'API Server' 
})
const db = await external_excalidraw_add_template({ 
  template: 'database', x: 660, y: 200, label: 'Database' 
})

// Connect them with arrows (use labels for protocols)
await external_excalidraw_connect({ fromId: frontend.elementId, toId: api.elementId, label: 'REST' })
await external_excalidraw_connect({ fromId: api.elementId, toId: db.elementId, label: 'SQL' })
\`\`\`

### Creating Interactive Buttons

You can add buttons that modify the diagram:

\`\`\`typescript
external_report_button({
  reportId: 'excalidraw-demo',
  id: 'add-service-btn',
  parentId: 'diagram-container',
  label: 'Add Microservice',
  variant: 'primary',
  handlers: {
    onPress: \`
      const elements = await external_excalidraw_get_elements({})
      // Find rightmost element to position new one
      let maxX = 100
      for (const el of elements) {
        if (el.x && el.width) {
          maxX = Math.max(maxX, el.x + el.width)
        }
      }
      
      await external_excalidraw_add_template({
        template: 'service',
        x: maxX + 50,
        y: 200,
        label: 'New Service'
      })
      
      await external_ui_toast({ message: 'Added new service!', variant: 'success' })
    \`
  }
})
\`\`\`

### Using NPM/GitHub Data

You can fetch data from NPM or GitHub and visualize it in diagrams:

**NPM Tools:**
- \`getNpmPackageInfo({ packageName })\` — get package metadata
- \`createNPMComparison({ period })\` + \`addToNPMComparison({ id, package })\` + \`executeNPMComparison({ id })\` — compare downloads

**GitHub Tools:**
- \`getRepoDetails({ owner, repo })\` — get repository stats
- \`searchRepositories({ query, sort? })\` — search repos
- \`getRepoContributors({ owner, repo })\` — get contributors

Example combining data with diagrams:
\`\`\`typescript
// First, get some data
const reactQuery = await getRepoDetails({ owner: 'TanStack', repo: 'query' })
const swr = await getRepoDetails({ owner: 'vercel', repo: 'swr' })

// Then create a comparison diagram
await external_excalidraw_add_template({
  template: 'service',
  x: 200, y: 200,
  label: \`React Query\\n\${reactQuery.stargazers_count} stars\`
})
await external_excalidraw_add_template({
  template: 'service', 
  x: 500, y: 200,
  label: \`SWR\\n\${swr.stargazers_count} stars\`
})
\`\`\`

### Available Report Bindings

You can also add other UI components:
- \`external_report_card({ reportId, id, title?, parentId? })\` — card container
- \`external_report_text({ reportId, content, parentId? })\` — text
- \`external_report_button({ reportId, id, label, handlers?, parentId? })\` — interactive button
- \`external_report_metric({ reportId, id, value, label, parentId? })\` — big number display

### Tips

1. Always read existing elements before adding connections
2. Use templates for common shapes - they have nice colors and styling
3. Add labels to connections to show data flow
4. Position elements in a logical flow (usually left-to-right or top-down)
5. Use the 'diagram' signal for subscriptions if you want components to update when the diagram changes
`

// Lazy initialization
let codeModeConfigCache: Awaited<ReturnType<typeof createCodeModeConfig>> | null =
  null
let executeTypescriptCache: ReturnType<typeof createCodeModeTool> | null = null
let codeModeSystemPromptCache: string | null = null

async function createCodeModeConfig() {
  const { createNodeIsolateDriver } = await import('@tanstack/ai-isolate-node')

  // Create excalidraw bindings for the specific report/canvas
  const excalidrawBindings = createExcalidrawBindings({
    getElements: () => getExcalidrawElements(REPORT_ID, CANVAS_ID),
    setElements: (elements) =>
      setExcalidrawElements(REPORT_ID, CANVAS_ID, elements),
    reportId: REPORT_ID,
    canvasId: CANVAS_ID,
  })

  return {
    driver: createNodeIsolateDriver(),
    tools: allTools,
    timeout: 60000,
    memoryLimit: 128,
    getSkillBindings: async () => ({
      ...createReportBindings(),
      ...excalidrawBindings,
    }),
  }
}

async function getCodeModeTools() {
  if (!codeModeConfigCache) {
    codeModeConfigCache = await createCodeModeConfig()
    executeTypescriptCache = createCodeModeTool(codeModeConfigCache)
    codeModeSystemPromptCache = createCodeModeSystemPrompt(codeModeConfigCache)
  }
  return {
    executeTypescript: executeTypescriptCache!,
    codeModeSystemPrompt: codeModeSystemPromptCache!,
  }
}

export const Route = createFileRoute('/api/excalidraw-demo' as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal
        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const provider: Provider = data?.provider || 'anthropic'
        const model: string | undefined = data?.model

        const adapter = getAdapter(provider, model)
        const { executeTypescript, codeModeSystemPrompt } =
          await getCodeModeTools()

        // Filter out report creation tools - we don't want the LLM to create new reports
        const filteredReportTools = reportTools.filter(
          (tool) => tool.name !== 'new_report' && tool.name !== 'delete_report',
        )

        try {
          const stream = chat({
            adapter,
            messages,
            tools: [executeTypescript, ...filteredReportTools],
            systemPrompts: [
              CODE_MODE_SYSTEM_PROMPT,
              codeModeSystemPrompt,
              EXCALIDRAW_SYSTEM_PROMPT,
            ],
            agentLoopStrategy: maxIterations(20),
            abortController,
            maxTokens: 8192,
          })

          const sseStream = toServerSentEventsStream(stream, abortController)

          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        } catch (error: unknown) {
          console.error('[API Excalidraw Demo Route] Error:', error)

          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }

          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
