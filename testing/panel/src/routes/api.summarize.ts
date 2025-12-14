import { createFileRoute } from '@tanstack/react-router'
import { ai, createOptions } from '@tanstack/ai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'
import { geminiSummarize } from '@tanstack/ai-gemini'
import { openaiSummarize } from '@tanstack/ai-openai'
import { ollamaSummarize } from '@tanstack/ai-ollama'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

// Pre-define typed adapter configurations with full type inference
const adapterConfig = {
  anthropic: () =>
    createOptions({
      adapter: anthropicSummarize(),
      model: 'claude-sonnet-4-5-20250929',
    }),
  gemini: () =>
    createOptions({
      adapter: geminiSummarize(),
      model: 'gemini-2.0-flash-exp',
    }),
  ollama: () =>
    createOptions({
      adapter: ollamaSummarize(),
      model: 'mistral:7b',
    }),
  openai: () =>
    createOptions({
      adapter: openaiSummarize(),
      model: 'gpt-4o-mini',
    }),
}

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
        const provider: Provider = body.provider || 'openai'

        try {
          // Get typed adapter options using createOptions pattern
          const options = adapterConfig[provider]()

          console.log(
            `>> summarize with model: ${options.model} on provider: ${provider} (stream: ${stream})`,
          )

          if (stream) {
            // Streaming mode
            const encoder = new TextEncoder()
            const readable = new ReadableStream({
              async start(controller) {
                try {
                  const streamResult = ai({
                    ...options,
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
                      model: options.model,
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
          const result = await ai({
            ...options,
            text,
            maxLength,
            style,
          })

          return new Response(
            JSON.stringify({
              summary: result.summary,
              provider,
              model: options.model,
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
