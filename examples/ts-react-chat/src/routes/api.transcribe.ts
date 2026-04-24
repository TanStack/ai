import { createFileRoute } from '@tanstack/react-router'
import { generateTranscription, toServerSentEventsResponse } from '@tanstack/ai'
import { z } from 'zod'
import { buildTranscriptionAdapter } from '../lib/server-audio-adapters'

const TRANSCRIPTION_PROVIDER_SCHEMA = z.enum(['openai', 'fal']).optional()

const TRANSCRIBE_BODY_SCHEMA = z.object({
  audio: z.string().min(1),
  language: z.string().optional(),
  provider: TRANSCRIPTION_PROVIDER_SCHEMA,
})

function jsonError(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/transcribe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return jsonError(400, {
            error: 'invalid_json',
            message: 'Request body must be valid JSON',
          })
        }

        const rawData = (body as { data?: unknown } | null)?.data
        if (rawData == null) {
          return jsonError(400, {
            error: 'missing_data',
            message: 'Request body must include a `data` field',
          })
        }

        const parsed = TRANSCRIBE_BODY_SCHEMA.safeParse(rawData)
        if (!parsed.success) {
          return jsonError(400, {
            error: 'validation_failed',
            message: 'Request data failed validation',
            details: z.treeifyError(parsed.error),
          })
        }

        const { audio, language, provider } = parsed.data

        try {
          const adapter = buildTranscriptionAdapter(provider ?? 'openai')

          const stream = generateTranscription({
            adapter,
            audio,
            language,
            stream: true,
          })

          return toServerSentEventsResponse(stream)
        } catch (err) {
          return jsonError(500, {
            error: 'transcription_failed',
            message:
              err instanceof Error ? err.message : 'Transcription failed',
          })
        }
      },
    },
  },
})
