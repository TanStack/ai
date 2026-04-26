import { createFileRoute } from '@tanstack/react-router'
import { summarize, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'

export const Route = createFileRoute('/api/summarize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { text, maxLength, style, model } = body.data

        const stream = summarize({
          adapter: openaiSummarize(model ?? 'gpt-4o-mini'),
          text,
          maxLength,
          style,
          stream: true,
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
