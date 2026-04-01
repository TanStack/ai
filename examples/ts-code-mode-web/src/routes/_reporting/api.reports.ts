import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import type { AnyTextAdapter } from '@tanstack/ai'

import { allTools } from '@/lib/tools'
import { CODE_MODE_SYSTEM_PROMPT, REPORTS_SYSTEM_PROMPT } from '@/lib/prompts'
import { reportTools } from '@/lib/reports/tools'
import { createReportBindings } from '@/lib/reports/create-report-bindings'

type Provider = 'anthropic' | 'openai' | 'gemini'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'anthropic':
    default:
      return anthropicText((model || 'claude-haiku-4-5') as 'claude-haiku-4-5')
  }
}

// Lazy initialization to avoid loading native modules at module load time
// This is necessary for RSC compatibility with Vite's module runner
let codeModeCache: {
  tool: ReturnType<typeof createCodeMode>['tool']
  systemPrompt: string
} | null = null

async function getCodeModeTools() {
  if (!codeModeCache) {
    const { createIsolateDriver } = await import('@/lib/create-isolate-driver')
    const driver = await createIsolateDriver('node')
    const { tool, systemPrompt } = createCodeMode({
      driver,
      tools: allTools,
      timeout: 60000,
      memoryLimit: 128,
      getSkillBindings: async () => createReportBindings(),
    })
    codeModeCache = { tool, systemPrompt }
  }
  return codeModeCache
}

export const Route = createFileRoute('/_reporting/api/reports' as any)({
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
        const { tool, systemPrompt } = await getCodeModeTools()

        try {
          const stream = chat({
            adapter,
            messages,
            tools: [tool, ...reportTools],
            systemPrompts: [
              CODE_MODE_SYSTEM_PROMPT,
              systemPrompt,
              REPORTS_SYSTEM_PROMPT,
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
          console.error('[API Reports Route] Error:', error)

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
