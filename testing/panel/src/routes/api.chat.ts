import * as fs from 'node:fs'
import * as path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toStreamResponse } from '@tanstack/ai'
import { anthropic } from '@tanstack/ai-anthropic'
import { gemini } from '@tanstack/ai-gemini'
import { openai } from '@tanstack/ai-openai'
import { ollama } from '@tanstack/ai-ollama'
import { createEventRecording } from '@/lib/recording'
import { allTools } from '@/lib/guitar-tools'

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

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Capture request signal before reading body (it may be aborted after body is consumed)
        const requestSignal = request.signal

        // If request is already aborted, return early
        if (requestSignal.aborted) {
          return new Response(null, { status: 499 }) // 499 = Client Closed Request
        }

        const abortController = new AbortController()

        const body = await request.json()
        const messages = body.messages
        const data = body.data || {}

        // Extract provider, model, and traceId from data
        const provider: Provider = data.provider || 'openai'
        const model: string | undefined = data.model
        const traceId: string | undefined = data.traceId

        console.log('body', body)

        try {
          // Select adapter based on provider
          let adapter
          let defaultModel

          switch (provider) {
            case 'anthropic':
              adapter = anthropic()
              defaultModel = 'claude-sonnet-4-5-20250929'
              break
            case 'gemini':
              adapter = gemini()
              defaultModel = 'gemini-2.0-flash-exp'
              break
            case 'ollama':
              adapter = ollama()
              defaultModel = 'mistral:7b'
              break
            case 'openai':
            default:
              adapter = openai()
              defaultModel = 'gpt-4o'
              break
          }

          // Determine model - use provided model or default based on provider
          const selectedModel = model || defaultModel

          // If we have a traceId, set up event-based recording
          let recording: ReturnType<typeof createEventRecording> | undefined
          if (traceId) {
            const traceDir = path.join(process.cwd(), 'test-traces')
            const traceFile = path.join(traceDir, `${traceId}.json`)
            recording = createEventRecording(traceFile, traceId)
          }

          // Use the stream abort signal for proper cancellation handling
          const stream = chat({
            adapter,
            model: selectedModel as any, // Dynamic model selection
            tools: allTools,
            systemPrompts: [SYSTEM_PROMPT],
            agentLoopStrategy: maxIterations(20),
            messages,
            providerOptions: {
              // Pass traceId through options so it appears in events
              ...(traceId ? { traceId } : {}),
              // Enable reasoning for OpenAI (gpt-5, o3 models):
              // reasoning: {
              //   effort: "medium", // or "low", "high", "minimal", "none" (for gpt-5.1)
              // },
              // Enable thinking for Anthropic:
              /*   thinking: {
                  type: "enabled",
                  budget_tokens: 2048,
                }, */
            },
            abortController,
          })

          // If we have a traceId, ensure recording is cleaned up after stream completes
          if (traceId && recording) {
            const recordingStream = (async function* () {
              try {
                for await (const chunk of stream) {
                  yield chunk
                }
              } finally {
                // Recording will be saved automatically when stream:ended event fires
                // But we can clean up the subscription here if needed
                // (Actually, the recording will clean itself up on stream:ended)
              }
            })()

            return toStreamResponse(recordingStream, { abortController })
          }

          return toStreamResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[API Route] Error in chat request:', {
            message: error?.message,
            name: error?.name,
            status: error?.status,
            statusText: error?.statusText,
            code: error?.code,
            type: error?.type,
            stack: error?.stack,
            error: error,
          })
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
