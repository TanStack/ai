import { createFileRoute } from '@tanstack/react-router'
import { summarize, createSummarizeOptions } from '@tanstack/ai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'
import { geminiSummarize } from '@tanstack/ai-gemini'
import { openaiSummarize } from '@tanstack/ai-openai'
import { ollamaSummarize } from '@tanstack/ai-ollama'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

// Pre-define typed adapter configurations with full type inference
const adapterConfig = {
  anthropic: () =>
    createSummarizeOptions({
      adapter: anthropicSummarize('claude-sonnet-4-5' as any),
    }),
  gemini: () =>
    createSummarizeOptions({
      adapter: geminiSummarize('gemini-2.0-flash' as any),
    }),
  ollama: () =>
    createSummarizeOptions({
      adapter: ollamaSummarize('mistral:7b'),
    }),
  openai: () =>
    createSummarizeOptions({
      adapter: openaiSummarize('gpt-4o-mini'),
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
          // Get typed adapter options using createSummarizeOptions pattern
          const options = adapterConfig[provider]()
          const model = options.adapter.model

          console.log(
            `>> summarize with model: ${model} on provider: ${provider} (stream: ${stream})`,
          )

          if (stream) {
            // Streaming mode
            const encoder = new TextEncoder()
            const readable = new ReadableStream({
              async start(controller) {
                try {
                  const streamResult = summarize({
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
                      model,
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
            ...options,
            text,
            maxLength,
            style,
          })

          return new Response(
            JSON.stringify({
              summary: result.summary,
              provider,
              model,
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
