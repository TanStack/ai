import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { z } from 'zod'
import { chat, toServerSentEventsStream } from '@tanstack/ai'
import { withSandbox } from '@tanstack/ai-sandbox'
import { withNgrokBridge } from '@tanstack/ai-sandbox/ngrok'
import {
  PREVIEW_GUIDANCE,
  RECIPE_GUIDANCE,
  buildAdapter,
  buildSandbox,
  isBridgeReachable,
  localWorkspaceGuidance,
  makeExposePreviewTool,
  missingEnv,
  needsNgrokBridge,
  previewGuidance,
  resolvePreviewUrl,
  tanstackStartRecipe,
} from '../sandbox-agent'
import {
  isGrokModel,
  isGrokProtocol,
  isGrokTransport,
  isHarness,
  isProvider,
} from '../sandbox-options'
import type {
  GrokBuildModel,
  GrokBuildProtocol,
  GrokTransport,
  HarnessName,
  ProviderName,
} from '../sandbox-options'
import type { AnyTool, ModelMessage, StreamChunk } from '@tanstack/ai'

/**
 * The run route: the browser's `useChat` POSTs `{ messages, data: { threadId,
 * harness, provider } }` and reads back an SSE stream of `StreamChunk`s.
 *
 * Unlike the Cloudflare example (which proxies to a Durable Object over a
 * WebSocket), this runs the agent loop right here: `chat()` with the chosen
 * harness adapter and `withSandbox(...)` middleware. The middleware
 * resumes-or-creates the thread's sandbox; the adapter spawns the coding-agent CLI
 * inside it and streams its events back out. The preview wiring depends on the
 * provider — bridge host tools (same-machine or ngrok-tunneled) or pre-mint the
 * URL when the bridge is unreachable; see `sandbox-agent.ts`.
 */

/** The layers `useChat` may nest forwarded props in, depending on the adapter. */
function bodyLayers(value: object): Array<object> {
  const layers: Array<object> = [value]
  if (
    'data' in value &&
    value.data !== null &&
    typeof value.data === 'object'
  ) {
    layers.push(value.data)
  }
  if (
    'forwardedProps' in value &&
    value.forwardedProps !== null &&
    typeof value.forwardedProps === 'object'
  ) {
    layers.push(value.forwardedProps)
  }
  return layers
}

/** First non-empty string for `key` across any body layer (top layer wins). */
function readForwarded(value: object, key: string): string | undefined {
  for (const layer of bodyLayers(value)) {
    const candidate: unknown = Reflect.get(layer, key)
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return undefined
}

const FORWARDED_KEYS = [
  'threadId',
  'harness',
  'provider',
  'grokModel',
  'grokProtocol',
  'grokTransport',
] as const

/** Flatten the nested `data`/`forwardedProps` layers into one object to validate. */
function flattenRunBody(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  const flat: Record<string, unknown> = {}
  if ('messages' in value) flat.messages = value.messages
  for (const key of FORWARDED_KEYS) {
    const found = readForwarded(value, key)
    if (found !== undefined) flat[key] = found
  }
  return flat
}

/**
 * Validates the run body. harness/provider/grok fields reuse the same type
 * guards as the picker UI (single source of truth in `sandbox-options`), so a
 * successful parse yields fully-typed values with no casts downstream.
 */
const runBodySchema = z.preprocess(
  flattenRunBody,
  z.object({
    messages: z
      .array(z.custom<ModelMessage>())
      .min(1, 'body.messages must be a non-empty array'),
    threadId: z.string().optional(),
    harness: z.custom<HarnessName>(isHarness, 'Unknown harness'),
    provider: z.custom<ProviderName>(isProvider, 'Unknown provider'),
    grokModel: z
      .custom<GrokBuildModel>(isGrokModel, 'Unknown grokModel')
      .optional(),
    grokProtocol: z
      .custom<GrokBuildProtocol>(isGrokProtocol, 'Unknown grokProtocol')
      .optional(),
    grokTransport: z
      .custom<GrokTransport>(isGrokTransport, 'Unknown grokTransport')
      .optional(),
  }),
)

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Request middleware: parse + validate the body once and hand the typed result
 * to the POST handler via context, short-circuiting with a 4xx on a bad request
 * so the handler only ever sees a valid `runBody`.
 */
const runBodyMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 })
    }
    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return jsonError(400, 'invalid JSON body')
    }
    const parsed = runBodySchema.safeParse(raw)
    if (!parsed.success) {
      return jsonError(400, parsed.error.issues[0]?.message ?? 'invalid body')
    }
    return next({ context: { runBody: parsed.data } })
  },
)

export const Route = createFileRoute('/api/run')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        POST: {
          middleware: [runBodyMiddleware],
          handler: async ({ request, context }) => {
            const {
              messages,
              threadId: threadIdInput,
              harness,
              provider,
              grokModel,
              grokProtocol,
              grokTransport,
            } = context.runBody

            const missing = missingEnv(harness, provider)
            if (missing.length > 0) {
              return jsonError(
                500,
                `Missing required env for ${harness} on ${provider}: ${missing.join(
                  ', ',
                )}. Set it and restart the dev server.`,
              )
            }

            const threadId = threadIdInput ?? crypto.randomUUID()

            const abortController = new AbortController()
            request.signal.addEventListener('abort', () =>
              abortController.abort(),
            )

            try {
              const sandbox = buildSandbox({ harness, provider, threadId })
              const handle = await sandbox.ensure({ threadId, runId: 'run' })
              const adapter = buildAdapter(
                harness,
                harness === 'grok'
                  ? {
                      model: grokModel ?? 'composer-2.5',
                      protocol: grokProtocol ?? 'acp',
                      transport: grokTransport ?? 'auto',
                    }
                  : undefined,
              )

              // Bridge host tools when the sandbox can reach the orchestrator
              // (same-machine, or remote via ngrok). Otherwise inline the recipe
              // and pre-mint the provider's public preview URL.
              let systemPrompts: Array<string>
              let tools: Array<AnyTool>
              const localWorkspaceHint =
                provider === 'local' ? [localWorkspaceGuidance(handle.id)] : []
              if (isBridgeReachable(provider)) {
                systemPrompts = [...localWorkspaceHint, PREVIEW_GUIDANCE]
                tools = [
                  tanstackStartRecipe,
                  makeExposePreviewTool(sandbox, threadId),
                ]
              } else {
                let previewUrl: string | undefined
                try {
                  previewUrl = await resolvePreviewUrl(sandbox, threadId)
                } catch (error) {
                  console.warn(
                    '[api/run] could not pre-resolve preview URL:',
                    error,
                  )
                }
                systemPrompts = [
                  ...localWorkspaceHint,
                  RECIPE_GUIDANCE,
                  previewGuidance(previewUrl),
                ]
                tools = []
              }

              const stream = chat({
                threadId,
                adapter,
                messages,
                systemPrompts,
                tools,
                middleware: needsNgrokBridge(provider)
                  ? [withSandbox(sandbox), withNgrokBridge]
                  : [withSandbox(sandbox)],
                abortController,
              }) as AsyncIterable<StreamChunk>

              return new Response(
                toServerSentEventsStream(stream, abortController),
                {
                  headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                  },
                },
              )
            } catch (error) {
              if (abortController.signal.aborted) {
                return new Response(null, { status: 499 })
              }
              console.error('[api/run] error:', error)
              return jsonError(
                502,
                error instanceof Error ? error.message : 'run error',
              )
            }
          },
        },
      }),
  },
})
