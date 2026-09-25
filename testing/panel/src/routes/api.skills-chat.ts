import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  createChatOptions,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { grokText } from '@tanstack/ai-grok'
import { openaiText } from '@tanstack/ai-openai'
import { ollamaText } from '@tanstack/ai-ollama'
import { openRouterText } from '@tanstack/ai-openrouter'
import { createResourceTool, withSkills } from '@tanstack/ai-skills'
import { recordActivation, skillsSource } from '@/lib/skills-store'
import type { ChatMiddleware } from '@tanstack/ai'
import type { Provider } from '@/lib/model-selection'

const SYSTEM_PROMPT = `You are a helpful assistant with a library of skills.

A catalog of available skills is provided. When the user's request matches a
skill, call the load_skill tool to load its instructions, then follow them for
your answer. If no skill fits, just answer normally.`

/**
 * Chat endpoint for the `/skills` demo. Wires `withSkills` over the demo
 * `skills/` folder so the model can load a skill (pirate-speak, haiku,
 * emoji-storyteller) on demand. A tiny observer middleware records each
 * load_skill activation per thread so the inspector at /api/skills-inspect can
 * highlight what was loaded.
 */
export const Route = createFileRoute('/api/skills-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) return new Response(null, { status: 499 })

        const abortController = new AbortController()
        const body = await request.json()
        const messages = body.messages
        const data = body.data || {}

        const provider: Provider = data.provider || 'openai'
        const model: string | undefined = data.model
        const threadId: string =
          typeof data.threadId === 'string' && data.threadId.length > 0
            ? data.threadId
            : 'panel-default-thread'

        try {
          const adapterConfig = {
            anthropic: () =>
              createChatOptions({
                adapter: anthropicText((model || 'claude-sonnet-4-5') as any),
              }),
            gemini: () =>
              createChatOptions({
                adapter: geminiText((model || 'gemini-2.5-flash') as any),
              }),
            grok: () =>
              createChatOptions({
                adapter: grokText((model || 'grok-build-0.1') as any),
              }),
            ollama: () =>
              createChatOptions({
                adapter: ollamaText((model || 'mistral:7b') as any),
              }),
            openai: () =>
              createChatOptions({
                adapter: openaiText((model || 'gpt-4o') as any),
              }),
            openrouter: () =>
              createChatOptions({
                adapter: openRouterText((model || 'openai/gpt-4o') as any),
              }),
          }

          const options = adapterConfig[provider]()
          const { adapter } = options

          // Record which skills the model loads so the inspector can show them.
          const observer: ChatMiddleware = {
            name: 'skills-observer',
            onBeforeToolCall: (_ctx, hookCtx) => {
              if (hookCtx.toolName === 'load_skill') {
                const args = hookCtx.args
                const name =
                  args && typeof args === 'object' && 'name' in args
                    ? String((args as { name: unknown }).name)
                    : undefined
                if (name) recordActivation(threadId, name)
              }
            },
          }

          const stream = chat({
            ...options,
            adapter,
            systemPrompts: [SYSTEM_PROMPT],
            tools: [createResourceTool(skillsSource)],
            middleware: [withSkills(skillsSource), observer],
            agentLoopStrategy: maxIterations(5),
            messages,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[api.skills-chat] Error:', error?.message)
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({ error: error.message || 'An error occurred' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
