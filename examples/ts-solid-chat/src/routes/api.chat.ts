import { createFileRoute } from '@tanstack/solid-router'
import {
  chat,
  createChatOptions,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { ollamaText } from '@tanstack/ai-ollama'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { openRouterText } from '@tanstack/ai-openrouter'
import { grokText } from '@tanstack/ai-grok'
import { groqText } from '@tanstack/ai-groq'
import { zaiText } from '@tanstack/ai-zai'
import { serverTools } from '@/lib/guitar-tools'
import type { Provider } from '@/lib/model-selection'
import type { AnyTextAdapter } from '@tanstack/ai'

const SYSTEM_PROMPT = `You are a helpful assistant for a guitar store.

CRITICAL INSTRUCTIONS - YOU MUST FOLLOW THIS EXACT WORKFLOW:

When a user asks for a guitar recommendation:
1. FIRST: Use the getGuitars tool (no parameters needed)
2. SECOND: Use the recommendGuitar tool with the ID of the guitar you want to recommend
3. NEVER write a recommendation directly - ALWAYS use the recommendGuitar tool

IMPORTANT:
- The recommendGuitar tool will display the guitar in a special, appealing format
- You MUST use recommendGuitar for ANY guitar recommendation
- ONLY recommend guitars from our inventory (use getGuitars first)
- The recommendGuitar tool has a buy button - this is how customers purchase
- Do NOT describe the guitar yourself - let the recommendGuitar tool do it

Example workflow:
User: "I want an acoustic guitar"
Step 1: Call getGuitars()
Step 2: Call recommendGuitar(id: "6") 
Step 3: Done - do NOT add any text after calling recommendGuitar
`

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Capture request signal before reading body (it may be aborted after body is consumed)
        const requestSignal = request.signal

        // If request is already aborted, return early
        if (requestSignal?.aborted) {
          return new Response(null, { status: 499 }) // 499 = Client Closed Request
        }

        const abortController = new AbortController()

        const { messages, data } = await request.json()
        const provider: Provider = data?.provider || 'openai'
        const model: string = data?.model || 'gpt-4o'

        try {
          const adapterConfig: Record<
            Provider,
            () => { adapter: AnyTextAdapter }
          > = {
            anthropic: () =>
              createChatOptions({
                adapter: anthropicText(
                  (model || 'claude-sonnet-4-5') as 'claude-sonnet-4-5',
                ),
              }),
            openrouter: () =>
              createChatOptions({
                adapter: openRouterText('openai/gpt-5.1'),
                modelOptions: {
                  reasoning: {
                    effort: 'medium',
                  },
                },
              }),
            gemini: () =>
              createChatOptions({
                adapter: geminiText(
                  (model || 'gemini-2.5-flash') as 'gemini-2.5-flash',
                ),
                modelOptions: {
                  thinkingConfig: {
                    includeThoughts: true,
                    thinkingBudget: 100,
                  },
                },
              }),
            grok: () =>
              createChatOptions({
                adapter: grokText((model || 'grok-3') as 'grok-3'),
                modelOptions: {},
              }),
            groq: () =>
              createChatOptions({
                adapter: groqText(
                  (model ||
                    'llama-3.3-70b-versatile') as 'llama-3.3-70b-versatile',
                ),
              }),
            ollama: () =>
              createChatOptions({
                adapter: ollamaText((model || 'gpt-oss:120b') as 'gpt-oss:120b'),
                modelOptions: { think: 'low', options: { top_k: 1 } },
              }),
            openai: () =>
              createChatOptions({
                adapter: openaiText((model || 'gpt-4o') as 'gpt-4o'),
                modelOptions: {},
              }),
            zai: () =>
              createChatOptions({
                adapter: zaiText((model || 'glm-4.7') as 'glm-4.7', {
                  coding: true,
                }),
                modelOptions: {},
              }),
          }

          const options = adapterConfig[provider]()

          const stream = chat({
            ...options,
            tools: serverTools,
            systemPrompts: [SYSTEM_PROMPT],
            agentLoopStrategy: maxIterations(20),
            messages,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          // If request was aborted, return early (don't send error response)
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 }) // 499 = Client Closed Request
          }
          return new Response(
            JSON.stringify({
              error: error.message || 'An error occurred',
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
