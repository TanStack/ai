import { createFileRoute } from '@tanstack/react-router'
import { generateSpeech, toServerSentEventsResponse } from '@tanstack/ai'
import { z } from 'zod'
import { buildSpeechAdapter } from '../lib/server-audio-adapters'

const SPEECH_PROVIDER_SCHEMA = z.enum(['openai', 'gemini', 'fal']).optional()

const SPEECH_BODY_SCHEMA = z.object({
  text: z.string().min(1),
  voice: z.string().optional(),
  format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional(),
  provider: SPEECH_PROVIDER_SCHEMA,
})

function jsonError(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/generate/speech')({
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

        const parsed = SPEECH_BODY_SCHEMA.safeParse(rawData)
        if (!parsed.success) {
          return jsonError(400, {
            error: 'validation_failed',
            message: 'Request data failed validation',
            details: z.treeifyError(parsed.error),
          })
        }

        const { text, voice, format, provider } = parsed.data

        try {
          const adapter = buildSpeechAdapter(provider ?? 'openai')

          const stream = generateSpeech({
            adapter,
            text,
            voice,
            format,
            stream: true,
          })

          return toServerSentEventsResponse(stream)
        } catch (err) {
          return jsonError(500, {
            error: 'generation_failed',
            message:
              err instanceof Error ? err.message : 'Speech generation failed',
          })
        }
      },
    },
  },
})
