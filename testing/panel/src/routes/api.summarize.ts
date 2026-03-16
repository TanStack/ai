import { createFileRoute } from '@tanstack/react-router'
import { summarize } from '@tanstack/ai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'
import { geminiSummarize } from '@tanstack/ai-gemini'
import { grokSummarize } from '@tanstack/ai-grok'
import { openaiSummarize } from '@tanstack/ai-openai'
import { ollamaSummarize } from '@tanstack/ai-ollama'
import { openRouterSummarize } from '@tanstack/ai-openrouter'

type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'grok'
  | 'openrouter'

export const Route = createFileRoute('/api/summarize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const {
          text,
          maxLength = 100,
          style = 'concise',
          stream = false,
        } = body
        const data = body.data || {}
        const provider: Provider = data.provider || body.provider || 'openai'
        // Don't set a global default - let each adapter use its own default model
        const model: string | undefined = data.model || body.model

        try {
          // Default models per provider
          const defaultModels: Record<Provider, string> = {
            anthropic: 'claude-sonnet-4-5',
            gemini: 'gemini-2.0-flash',
            grok: 'grok-3-mini',
            ollama: 'mistral:7b',
            openai: 'gpt-4o-mini',
            openrouter: 'openai/gpt-4o-mini',
          }

          // Determine the actual model being used
          const actualModel = model || defaultModels[provider]

          const adapterByProvider = {
            anthropic: anthropicSummarize(actualModel as any),
            gemini: geminiSummarize(actualModel as any),
            grok: grokSummarize(actualModel as any),
            ollama: ollamaSummarize(actualModel),
            openai: openaiSummarize(actualModel as any),
            openrouter: openRouterSummarize(actualModel as any),
          } as const
          const adapter = adapterByProvider[provider]

          console.log(
            `>> summarize with model: ${actualModel} on provider: ${provider} (stream: ${stream})`,
          )

          if (stream) {
            // Streaming mode
            const encoder = new TextEncoder()
            const readable = new ReadableStream({
              async start(controller) {
                try {
                  const streamResult = summarize({
                    adapter,
                    text,
                    maxLength,
                    style,
                    stream: true,
                  })

                  for await (const chunk of streamResult) {
                    const data = JSON.stringify({
                      type: chunk.type,
                      delta: 'delta' in chunk ? chunk.delta : undefined,
                      content: 'content' in chunk ? chunk.content : undefined,
                      provider,
                      model: ('model' in chunk && chunk.model) || actualModel,
                    })
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`))
                  }

                  controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                  controller.close()
                } catch (error: any) {
                  const errorData = JSON.stringify({
                    type: 'error',
                    error: error.message || 'An error occurred',
                  })
                  controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
                  controller.close()
                }
              },
            })

            return new Response(readable, {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
              },
            })
          }

          // Non-streaming mode
          const result = await summarize({
            adapter,
            text,
            maxLength,
            style,
          })

          return new Response(
            JSON.stringify({
              summary: result.summary,
              provider,
              model: result.model || actualModel,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error: any) {
          console.error('[API Route] Error in summarize request:', error)
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
