import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFileRoute } from '@tanstack/react-router'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { createAlwaysTrustedStrategy } from '@tanstack/ai-code-mode-skills'
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import { zaiText } from '@tanstack/ai-zai'
import { z } from 'zod'

import type { AnyTextAdapter } from '@tanstack/ai'
import type { IsolateDriver } from '@tanstack/ai-code-mode'

import { cityTools } from '@/lib/tools/city-tools'
import { structuredOutput } from '@/lib/structured-output'

type Provider = 'anthropic' | 'openai' | 'gemini' | 'zai'

const TravelReportSchema = z.object({
  title: z.string().describe('Short title for the report'),
  summary: z.string().describe('One paragraph summary'),
  keyFindings: z.array(z.string()).describe('Key findings'),
  recommendedCities: z
    .array(
      z.object({
        name: z.string(),
        country: z.string(),
        reason: z.string(),
      }),
    )
    .describe('Recommended cities with reasons'),
  comparison: z.object({
    firstCity: z.string(),
    secondCity: z.string(),
    populationDifferenceMillions: z.number(),
    highlights: z.array(z.string()),
  }),
  nextSteps: z.array(z.string()).describe('Practical follow-up actions'),
})

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'zai':
      return zaiText((model || 'glm-4.7') as 'glm-4.7')
    case 'anthropic':
    default:
      return anthropicText(
        (model || 'claude-sonnet-4-5') as 'claude-sonnet-4-5',
      )
  }
}

let codeModeCache: {
  tool: ReturnType<typeof createCodeMode>['tool']
  systemPrompt: string
  driver: IsolateDriver
} | null = null

async function getCodeModeTools() {
  if (!codeModeCache) {
    const { createIsolateDriver } = await import('@/lib/create-isolate-driver')
    const driver = await createIsolateDriver('node')
    const { tool, systemPrompt } = createCodeMode({
      driver,
      tools: cityTools,
      timeout: 30000,
      memoryLimit: 128,
    })
    codeModeCache = { tool, systemPrompt, driver }
  }
  return codeModeCache
}

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const skillsDir = resolve(__dirname, '../../../.structured-output-skills')
const trustStrategy = createAlwaysTrustedStrategy()
const skillStorage = createFileSkillStorage({
  directory: skillsDir,
  trustStrategy,
})

export const Route = createFileRoute(
  '/_structured-output/api/structured-output',
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, provider, model, withSkills } = body as {
          prompt: string
          provider?: Provider
          model?: string
          withSkills?: boolean
        }

        const adapter = getAdapter(provider || 'anthropic', model)

        try {
          const { tool, systemPrompt, driver } = await getCodeModeTools()

          const result = await structuredOutput({
            adapter,
            prompt,
            outputSchema: TravelReportSchema,
            codeMode: {
              tool,
              systemPrompt,
              driver,
              codeTools: cityTools,
            },
            skills: withSkills
              ? {
                  storage: skillStorage,
                  trustStrategy,
                  timeout: 30000,
                  memoryLimit: 128,
                }
              : undefined,
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
