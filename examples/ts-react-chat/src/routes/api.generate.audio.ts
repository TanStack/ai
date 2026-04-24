import { createFileRoute } from '@tanstack/react-router'
import { generateAudio, toServerSentEventsResponse } from '@tanstack/ai'
import { z } from 'zod'
import {
  InvalidModelOverrideError,
  UnknownProviderError,
  buildAudioAdapter,
} from '../lib/server-audio-adapters'

const AUDIO_PROVIDER_SCHEMA = z
  .enum(['gemini-lyria', 'fal-audio', 'fal-sfx'])
  .optional()

const AUDIO_BODY_SCHEMA = z.object({
  prompt: z.string().min(1),
  duration: z.number().optional(),
  provider: AUDIO_PROVIDER_SCHEMA,
  model: z.string().optional(),
})

function jsonError(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/generate/audio')({
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

        const parsed = AUDIO_BODY_SCHEMA.safeParse(rawData)
        if (!parsed.success) {
          return jsonError(400, {
            error: 'validation_failed',
            message: 'Request data failed validation',
            details: z.treeifyError(parsed.error),
          })
        }

        const { prompt, duration, provider, model } = parsed.data

        try {
          const adapter = buildAudioAdapter(provider ?? 'gemini-lyria', model)

          const stream = generateAudio({
            adapter,
            prompt,
            duration,
            stream: true,
          })

          return toServerSentEventsResponse(stream)
        } catch (err) {
          if (err instanceof InvalidModelOverrideError) {
            return jsonError(400, {
              error: 'invalid_model_override',
              message: err.message,
              provider: err.providerId,
              requestedModel: err.requestedModel,
              allowedModels: err.allowedModels,
            })
          }
          // Defense-in-depth: the Zod enum schema above should already reject
          // unknown providers, but surface a typed 400 here in case that
          // validation drifts or is bypassed.
          if (err instanceof UnknownProviderError) {
            return jsonError(400, {
              error: 'unknown_provider',
              message: err.message,
              // Use `provider` consistently with the invalid_model_override
              // branch and the request body's `provider` field.
              provider: err.providerId,
              allowedProviders: err.allowedProviders,
            })
          }
          return jsonError(500, {
            error: 'generation_failed',
            message:
              err instanceof Error ? err.message : 'Audio generation failed',
          })
        }
      },
    },
  },
})
