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
import { audioTools } from '@/lib/audio/audio-tools'
import { dspTools } from '@/lib/audio/dsp-tools'
import { analyzeTools } from '@/lib/audio/analyze-tools'
import { plotTools } from '@/lib/audio/plot-tools'
import { pluginTools } from '@/lib/audio/plugin-tools'
import { monitorTools } from '@/lib/audio/monitor-tools'
import { AUDIO_WORKBENCH_SYSTEM_PROMPT } from '@/lib/audio/prompts'

type Provider = 'anthropic' | 'openai' | 'gemini'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'anthropic':
    default:
      return anthropicText(
        (model || 'claude-haiku-4-5') as 'claude-haiku-4-5',
      )
  }
}

// Combine all audio workbench tools
const allAudioTools = [
  ...audioTools,
  ...dspTools,
  ...analyzeTools,
  ...plotTools,
  ...pluginTools,
  ...monitorTools,
]

// Lazy initialization to avoid loading native modules at module load time
let audioCodeModeConfig: Awaited<ReturnType<typeof createAudioCodeModeConfig>> | null = null
let executeTypescript: ReturnType<typeof createCodeModeTool> | null = null
let codeModeSystemPrompt: string | null = null

async function createAudioCodeModeConfig() {
  const { createNodeIsolateDriver } = await import('@tanstack/ai-isolate-node')
  return {
    driver: createNodeIsolateDriver(),
    tools: allAudioTools,
    timeout: 120000, // 2 minutes for audio processing
    memoryLimit: 256, // More memory for audio data
  }
}

async function getAudioCodeModeTools() {
  if (!audioCodeModeConfig) {
    audioCodeModeConfig = await createAudioCodeModeConfig()
    executeTypescript = createCodeModeTool(audioCodeModeConfig)
    codeModeSystemPrompt = createCodeModeSystemPrompt(audioCodeModeConfig)
  }
  return {
    executeTypescript: executeTypescript!,
    codeModeSystemPrompt: codeModeSystemPrompt!,
  }
}

export const Route = createFileRoute('/api/audio')({
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
          await getAudioCodeModeTools()

        try {
          const stream = chat({
            adapter,
            messages,
            tools: [executeTypescript],
            systemPrompts: [
              AUDIO_WORKBENCH_SYSTEM_PROMPT,
              codeModeSystemPrompt,
            ],
            agentLoopStrategy: maxIterations(15),
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
          console.error('[Audio API Route] Error:', error)

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
