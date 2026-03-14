import { createFileRoute } from '@tanstack/react-router'
import type { AnyTextAdapter } from '@tanstack/ai'
import { createCodeModeToolAndPrompt } from '@tanstack/ai-code-mode'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import { cityTools } from '@/lib/tools/city-tools'
import { structuredOutput } from '@/lib/structured-output-types'

type Provider = 'anthropic' | 'openai' | 'gemini'

const JSON_SCHEMA_DESCRIPTION = `{
  "title": "string — short title for the report",
  "summary": "string — one paragraph summary",
  "keyFindings": ["string — each a key finding"],
  "recommendedCities": [
    { "name": "string", "country": "string", "reason": "string" }
  ],
  "comparison": {
    "firstCity": "string",
    "secondCity": "string",
    "populationDifferenceMillions": number,
    "highlights": ["string"]
  },
  "nextSteps": ["string — practical follow-up actions"]
}`

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'anthropic':
    default:
      return anthropicText(
        (model || 'claude-sonnet-4-5') as 'claude-sonnet-4-5',
      )
  }
}

let codeModeCache: {
  tool: ReturnType<typeof createCodeModeToolAndPrompt>['tool']
  systemPrompt: string
} | null = null

async function getCodeModeTools() {
  if (!codeModeCache) {
    const { createIsolateDriver } = await import('@/lib/create-isolate-driver')
    const driver = await createIsolateDriver('node')
    const { tool, systemPrompt } = createCodeModeToolAndPrompt({
      driver,
      tools: cityTools,
      timeout: 30000,
      memoryLimit: 128,
    })
    codeModeCache = { tool, systemPrompt }
  }
  return codeModeCache
}

export const Route = createFileRoute(
  '/_structured-output/api/structured-output',
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, provider, model } = body as {
          prompt: string
          provider?: Provider
          model?: string
        }

        const adapter = getAdapter(provider || 'anthropic', model)

        try {
          const codeMode = await getCodeModeTools()

          const result = await structuredOutput({
            adapter,
            prompt,
            jsonSchemaDescription: JSON_SCHEMA_DESCRIPTION,
            codeMode,
          })

          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: unknown) {
          console.error('[Structured Output API] Error:', error)

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
