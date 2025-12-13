import { createFileRoute } from '@tanstack/react-router'
import { ai } from '@tanstack/ai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'
import { geminiSummarize } from '@tanstack/ai-gemini'
import { openaiSummarize } from '@tanstack/ai-openai'
import { ollamaSummarize } from '@tanstack/ai-ollama'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

function getAdapterAndModel(provider: Provider) {
  switch (provider) {
    case 'anthropic':
      return {
        adapter: anthropicSummarize(),
        model: 'claude-sonnet-4-5-20250929',
      }
    case 'gemini':
      return { adapter: geminiSummarize(), model: 'gemini-2.0-flash-exp' }
    case 'ollama':
      return { adapter: ollamaSummarize(), model: 'mistral:7b' }
    case 'openai':
    default:
      return { adapter: openaiSummarize(), model: 'gpt-4o-mini' }
  }
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
          const { adapter, model } = getAdapterAndModel(provider)

          console.log(
            `>> summarize with model: ${model} on provider: ${provider} (stream: ${stream})`,
          )

          if (stream) {
            // Streaming mode
            const encoder = new TextEncoder()
            const readable = new ReadableStream({
              async start(controller) {
                try {
                  const streamResult = ai({
                    adapter: adapter as any,
                    model: model as any,
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
          const result = await ai({
            adapter: adapter as any,
            model: model as any,
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
