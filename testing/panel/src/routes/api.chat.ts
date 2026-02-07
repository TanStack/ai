import * as path from 'node:path'
import * as fs from 'node:fs'
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
import type { AIAdapter, StreamChunk } from '@tanstack/ai'
import type { ChunkRecording } from '@/lib/recording'
import {
  addToCartToolDef,
  addToWishListToolDef,
  getGuitars,
  getPersonalGuitarPreferenceToolDef,
  recommendGuitarToolDef,
} from '@/lib/guitar-tools'

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
const addToCartToolServer = addToCartToolDef.server((args) => ({
  success: true,
  cartId: 'CART_' + Date.now(),
  guitarId: args.guitarId,
  quantity: args.quantity,
  totalItems: args.quantity,
}))

type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'grok'
  | 'openrouter'

/**
 * Wraps an adapter to intercept chatStream and record raw chunks from the adapter
 * before they're processed by the stream processor.
 */
function wrapAdapterForRecording<TAdapter extends AIAdapter>(
  adapter: TAdapter,
  recordingFilePath: string,
  model: string,
  provider: string,
): TAdapter {
  // Type guard to check if adapter has chatStream
  if (!('chatStream' in adapter) || typeof adapter.chatStream !== 'function') {
    return adapter
  }

  const originalChatStream = adapter.chatStream.bind(adapter)

  // Track chunks for recording
  const chunks: Array<{
    chunk: StreamChunk
    timestamp: number
    index: number
  }> = []
  let chunkIndex = 0

  // Create a wrapper that intercepts chatStream
  const wrappedAdapter = {
    ...adapter,
    chatStream: async function* (
      options: Parameters<typeof originalChatStream>[0],
    ): AsyncIterable<StreamChunk> {
      const startTime = Date.now()

      try {
        // Iterate over chunks from the original adapter
        for await (const chunk of originalChatStream(options)) {
          const timestamp = Date.now()
          const index = chunkIndex++

          // Record the chunk
          chunks.push({
            chunk,
            timestamp,
            index,
          })

          // Yield the chunk to continue normal processing
          yield chunk
        }
      } finally {
        // Save recording when stream completes
        try {
          const recording: ChunkRecording = {
            version: '1.0',
            timestamp: startTime,
            model,
            provider,
            chunks,
          }

          // Ensure directory exists
          const dir = path.dirname(recordingFilePath)
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
          }

          // Write recording
          fs.writeFileSync(
            recordingFilePath,
            JSON.stringify(recording, null, 2),
            'utf-8',
          )

          console.log(`Adapter chunks recorded to: ${recordingFilePath}`)
        } catch (error) {
          console.error('Failed to save adapter chunk recording:', error)
        }
      }
    },
  } as TAdapter

  return wrappedAdapter
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // #region agent log
        console.log(
          '[DEBUG] POST /api/chat handler entered at',
          new Date().toISOString(),
        )
        fetch(
          'http://127.0.0.1:7244/ingest/830522ab-8098-40b9-a021-890f9c041588',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'api.chat.ts:POST:ENTRY',
              message: 'POST handler entered',
              data: { url: request.url, method: request.method },
              timestamp: Date.now(),
              hypothesisId: 'ENTRY0',
            }),
          },
        ).catch(() => {})
        // #endregion
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
        const model: string = data.model || 'gpt-4o'
        const traceId: string | undefined = data.traceId

        try {
          // Pre-define typed adapter configurations with full type inference
          // Model is passed to the adapter factory function for type-safe autocomplete
          const adapterConfig = {
            anthropic: () =>
              createChatOptions({
                adapter: anthropicText((model || 'claude-sonnet-4-5') as any),
              }),
            gemini: () =>
              createChatOptions({
                adapter: geminiText((model || 'gemini-2.0-flash') as any),
              }),
            grok: () =>
              createChatOptions({
                adapter: grokText((model || 'grok-3') as any),
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

          // Get typed adapter options using createChatOptions pattern
          const options = adapterConfig[provider]()
          let { adapter } = options

          console.log(`>> model: ${model} on provider: ${provider}`)
          // #region agent log
          if (provider === 'openrouter') {
            fetch(
              'http://127.0.0.1:7244/ingest/830522ab-8098-40b9-a021-890f9c041588',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  location: 'api.chat.ts:POST',
                  message: 'openrouter request start',
                  data: {
                    provider,
                    model,
                    messageCount: messages?.length,
                    adapterKind: (adapter as any)?.kind,
                    adapterName: (adapter as any)?.name,
                  },
                  timestamp: Date.now(),
                  hypothesisId: 'ENTRY',
                }),
              },
            ).catch(() => {})
          }
          // #endregion

          // If we have a traceId, wrap the adapter to record raw chunks from chatStream
          if (traceId) {
            const traceDir = path.join(process.cwd(), 'test-traces')
            if (!fs.existsSync(traceDir)) {
              fs.mkdirSync(traceDir, { recursive: true })
            }
            const traceFile = path.join(traceDir, `${traceId}.json`)
            adapter = wrapAdapterForRecording(
              adapter,
              traceFile,
              model,
              provider,
            )
          }

          // Use the stream abort signal for proper cancellation handling
          let stream: AsyncIterable<any>
          try {
            stream = chat({
              ...options,
              adapter, // Use potentially wrapped adapter
              tools: [
                getGuitars, // Server tool
                recommendGuitarToolDef, // No server execute - client will handle
                addToCartToolServer,
                addToWishListToolDef,
                getPersonalGuitarPreferenceToolDef,
              ],
              systemPrompts: [SYSTEM_PROMPT],
              agentLoopStrategy: maxIterations(20),
              messages,
              modelOptions: {
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
          } catch (chatError: any) {
            // #region agent log
            if (provider === 'openrouter') {
              fetch(
                'http://127.0.0.1:7244/ingest/830522ab-8098-40b9-a021-890f9c041588',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    location: 'api.chat.ts:POST',
                    message: 'chat() threw error',
                    data: {
                      errorMessage: chatError?.message,
                      errorName: chatError?.name,
                      errorStack: chatError?.stack?.slice(0, 500),
                    },
                    timestamp: Date.now(),
                    hypothesisId: 'E',
                  }),
                },
              ).catch(() => {})
            }
            // #endregion
            throw chatError
          }

          // #region agent log
          if (provider === 'openrouter') {
            fetch(
              'http://127.0.0.1:7244/ingest/830522ab-8098-40b9-a021-890f9c041588',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  location: 'api.chat.ts:POST',
                  message:
                    'chat() returned stream, calling toServerSentEventsResponse',
                  data: {
                    streamType: typeof stream,
                    isAsyncIterable: !!stream[Symbol.asyncIterator],
                  },
                  timestamp: Date.now(),
                  hypothesisId: 'FLOW',
                }),
              },
            ).catch(() => {})
          }
          // #endregion

          return toServerSentEventsResponse(stream, { abortController })
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
