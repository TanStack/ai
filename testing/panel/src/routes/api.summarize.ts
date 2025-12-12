import { createFileRoute } from '@tanstack/react-router'
import { ai } from '@tanstack/ai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'
import { geminiSummarize } from '@tanstack/ai-gemini'
import { openaiSummarize } from '@tanstack/ai-openai'
import { ollamaSummarize } from '@tanstack/ai-ollama'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

export const Route = createFileRoute('/api/summarize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { text, maxLength = 100, style = 'concise' } = body
        const provider: Provider = body.provider || 'openai'

        try {
          // Select adapter and model based on provider
          let adapter
          let model

          switch (provider) {
            case 'anthropic':
              adapter = anthropicSummarize()
              model = 'claude-sonnet-4-5-20250929'
              break
            case 'gemini':
              adapter = geminiSummarize()
              model = 'gemini-2.0-flash-exp'
              break

            case 'ollama':
              adapter = ollamaSummarize()
              model = 'mistral:7b'
              break
            case 'openai':
            default:
              adapter = openaiSummarize()
              model = 'gpt-4o-mini'
              break
          }

          console.log(
            `>> summarize with model: ${model} on provider: ${provider}`,
          )

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
