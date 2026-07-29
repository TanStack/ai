import { createFileRoute } from '@tanstack/react-router'
import {
  generateSpeech,
  generationParamsFromBody,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { withGenerationPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import {
  InvalidModelOverrideError,
  UnknownProviderError,
  buildSpeechAdapter,
} from '../lib/server-audio-adapters'
import { replayGenerationIfResuming } from '../lib/generation-durability'
import {
  artifactServeUrl,
  generationServerPersistence,
} from '../lib/generation-server-store'

const SPEECH_PROVIDER_SCHEMA = z
  .enum(['openai', 'gemini', 'fal', 'grok', 'elevenlabs'])
  .optional()

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

        // The AG-UI envelope also carries the generation's identity. Persistence
        // files the run under it, so a reload hydrates the same slot.
        let threadId: string | undefined
        let runId: string | undefined
        try {
          ;({ threadId, runId } = generationParamsFromBody('tts', body))
        } catch (err) {
          return jsonError(400, {
            error: 'invalid_envelope',
            message:
              err instanceof Error ? err.message : 'Invalid request envelope',
          })
        }

        try {
          const adapter = buildSpeechAdapter(provider ?? 'openai')

          const stream = generateSpeech({
            adapter,
            text,
            voice,
            format,
            stream: true,
            ...(threadId ? { threadId } : {}),
            ...(runId ? { runId } : {}),
            // Copies the synthesized speech into our blob store and rewrites the
            // result to the shared `/api/artifacts` serve URL, so a restored run
            // still plays after the provider's link expires.
            middleware: [
              withGenerationPersistence(generationServerPersistence(), {
                artifactUrl: (ref) => artifactServeUrl(ref.artifactId),
              }),
            ],
          })

          // Delivery durability: chunks are logged and id-tagged, so a
          // reconnect or a mount-time `joinRun` replays instead of re-running
          // the model. The run still ends with the request — this activity is
          // short enough to simply re-run.
          return toServerSentEventsResponse(stream, {
            durability: { adapter: memoryStream(request) },
          })
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
              provider: err.providerId,
              allowedProviders: err.allowedProviders,
            })
          }
          return jsonError(500, {
            error: 'generation_failed',
            message:
              err instanceof Error ? err.message : 'Speech generation failed',
          })
        }
      },

      // `joinRun` replay — re-attach to a run still in flight from a previous
      // request. 404 when the run is unknown or its log has aged out, rather
      // than the SPA shell the client cannot parse as SSE.
      GET: ({ request }) =>
        replayGenerationIfResuming(request) ??
        new Response('no resumable run', { status: 404 }),
    },
  },
})
