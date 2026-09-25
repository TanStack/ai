import { createFileRoute } from '@tanstack/react-router'
import {
  generateTranscription,
  generationParamsFromBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { createOpenaiTranscription } from '@tanstack/ai-openai'

export const Route = createFileRoute('/api/transcribe')({
  server: {
    handlers: {
      GET: async () =>
        new Response('Use POST', {
          status: 405,
          headers: { allow: 'POST' },
        }),
      POST: async ({ request }) => {
        const apiKey = getByokKey(request, openaiByok)
        if (!apiKey) return byokMissing(openaiByok)

        let params
        try {
          params = generationParamsFromBody(
            'transcription',
            await request.json(),
          )
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const stream = generateTranscription({
          adapter: createOpenaiTranscription('gpt-4o-transcribe', apiKey),
          ...params.input,
          stream: true,
          ...(params.threadId ? { threadId: params.threadId } : {}),
          ...(params.runId ? { runId: params.runId } : {}),
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
