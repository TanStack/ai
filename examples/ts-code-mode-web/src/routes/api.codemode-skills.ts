import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import {
  codeModeWithSkills,
  createAlwaysTrustedStrategy,
} from '@tanstack/ai-code-mode-skills'
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'

import type { AnyTextAdapter } from '@tanstack/ai'

import { allTools } from '@/lib/tools'
import { CODE_MODE_SYSTEM_PROMPT, REPORTS_SYSTEM_PROMPT } from '@/lib/prompts'
import { reportTools } from '@/lib/reports/tools'

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

// Selection adapter - use a cheap/fast model for skill selection
function getSelectionAdapter(): AnyTextAdapter {
  // Use GPT-4o-mini for fast, cheap skill selection
  return openaiText('gpt-4o-mini' as 'gpt-4o')
}

// Resolve skills directory relative to project root
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const skillsDir = resolve(__dirname, '../../../../.skills')

// Trust strategy - trust skills immediately (for development)
const trustStrategy = createAlwaysTrustedStrategy()

// Skill storage configuration with always-trusted strategy
const skillStorage = createFileSkillStorage({
  directory: skillsDir,
  trustStrategy,
})

// Lazy initialization to avoid loading native modules at module load time
let skillsCodeModeConfig: Awaited<ReturnType<typeof createSkillsCodeModeConfig>> | null = null
let skillsConfig: ReturnType<typeof createSkillsConfig> | null = null

async function createSkillsCodeModeConfig() {
  const { createNodeIsolateDriver } = await import('@tanstack/ai-isolate-node')

  return {
    driver: createNodeIsolateDriver(),
    tools: allTools,
    timeout: 60000,
    memoryLimit: 128,
  }
}

function createSkillsConfig() {
  return {
    storage: skillStorage,
    maxSkillsInContext: 5,
    trustStrategy,
  }
}

async function getSkillsCodeModeConfig() {
  if (!skillsCodeModeConfig) {
    skillsCodeModeConfig = await createSkillsCodeModeConfig()
  }
  if (!skillsConfig) {
    skillsConfig = createSkillsConfig()
  }
  return { codeModeConfig: skillsCodeModeConfig!, skillsConfig: skillsConfig! }
}

export const Route = createFileRoute('/api/codemode-skills')({
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

        const mainAdapter = getAdapter(provider, model)
        const selectionAdapter = getSelectionAdapter()

        try {
          const { codeModeConfig, skillsConfig } = await getSkillsCodeModeConfig()

          // Get registry and system prompt with skills
          // The registry allows dynamic tool additions mid-stream (e.g., when register_skill is called)
          const { registry, systemPrompt, selectedSkills } =
            await codeModeWithSkills({
              config: codeModeConfig,
              adapter: selectionAdapter,
              skills: skillsConfig,
              messages,
            })

          console.log(
            '[API] Selected skills:',
            selectedSkills.map((s) => s.name),
          )

          // Add report tools to the registry
          for (const tool of reportTools) {
            registry.add(tool)
          }

          console.log(
            '[API] Total tools available:',
            registry.getTools().map((t) => t.name),
          )

          const stream = chat({
            adapter: mainAdapter,
            messages,
            // Use toolRegistry for dynamic tool additions
            toolRegistry: registry,
            systemPrompts: [CODE_MODE_SYSTEM_PROMPT, REPORTS_SYSTEM_PROMPT, systemPrompt],
            agentLoopStrategy: maxIterations(15),
            abortController,
            // Increase max tokens to allow for large tool calls like register_skill
            // which includes code, schemas, and descriptions
            maxTokens: 8192,
          })

          const sseStream = toServerSentEventsStream(stream, abortController)

          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              // Include selected skills in response header for UI
              'X-Selected-Skills': JSON.stringify(
                selectedSkills.map((s) => s.name),
              ),
            },
          })
        } catch (error: unknown) {
          console.error('[API Route] Error:', error)

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
