import { createFileRoute } from '@tanstack/react-router'
import {
  generateTranscription,
  generationParamsFromBody,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { withGenerationPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import {
  InvalidModelOverrideError,
  UnknownProviderError,
  buildTranscriptionAdapter,
} from '../lib/server-audio-adapters'
import { replayGenerationIfResuming } from '../lib/generation-durability'
import {
  artifactServeUrl,
  generationServerPersistence,
} from '../lib/generation-server-store'

const TRANSCRIPTION_PROVIDER_SCHEMA = z
  .enum(['openai', 'openai-diarize', 'fal', 'grok', 'elevenlabs'])
  .optional()

const TRANSCRIPTION_RESPONSE_FORMAT_SCHEMA = z
  .enum(['json', 'text', 'srt', 'verbose_json', 'vtt'])
  .optional()

const TRANSCRIBE_BODY_SCHEMA = z.object({
  audio: z.string().min(1),
  language: z.string().optional(),
  responseFormat: TRANSCRIPTION_RESPONSE_FORMAT_SCHEMA,
  modelOptions: z.record(z.string(), z.any()).optional(),
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

        const { audio, language, responseFormat, modelOptions, provider } =
          parsed.data

        // The AG-UI envelope also carries the generation's identity. Persistence
        // files the run under it, so a reload hydrates the same slot.
        let threadId: string | undefined
        let runId: string | undefined
        try {
          ;({ threadId, runId } = generationParamsFromBody(
            'transcription',
            body,
          ))
        } catch (err) {
          return jsonError(400, {
            error: 'invalid_envelope',
            message:
              err instanceof Error ? err.message : 'Invalid request envelope',
          })
        }

        try {
          const adapter = buildTranscriptionAdapter(provider ?? 'openai')

          const stream = generateTranscription({
            adapter,
            audio,
            language,
            responseFormat,
            modelOptions,
            stream: true,
            ...(threadId ? { threadId } : {}),
            ...(runId ? { runId } : {}),
            // Transcription produces text, not media — what gets persisted here
            // is the run record plus the INPUT audio as an artifact, so a
            // restored run still shows what was transcribed.
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
            error: 'transcription_failed',
            message:
              err instanceof Error ? err.message : 'Transcription failed',
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
