import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsStream } from '@tanstack/ai'
import { withSandbox } from '@tanstack/ai-sandbox'
import {
  PREVIEW_GUIDANCE,
  RECIPE_GUIDANCE,
  buildAdapter,
  buildSandbox,
  isHarness,
  isProvider,
  makeExposePreviewTool,
  missingEnv,
  previewGuidance,
  resolvePreviewUrl,
  tanstackStartRecipe,
  usesToolBridge,
} from '../sandbox-agent'
import {
  isGrokProtocol,
  isGrokTransport,
} from '../sandbox-options'
import type { GrokBuildProtocol, GrokTransport } from '../sandbox-options'
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
 * provider — bridge host tools (same-machine) or pre-mint the URL (hosted); see
 * `sandbox-agent.ts`.
 */

interface RunBody {
  messages: Array<ModelMessage>
  threadId?: string
  harness?: unknown
  provider?: unknown
  grokProtocol?: unknown
  grokTransport?: unknown
}

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
  return layers
}

/** First non-empty string the accessor pulls from any body layer. */
function readForwarded(
  value: object,
  read: (layer: object) => unknown,
): string | undefined {
  for (const layer of bodyLayers(value)) {
    const candidate = read(layer)
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return undefined
}

function parseBody(value: unknown): RunBody {
  if (value === null || typeof value !== 'object' || !('messages' in value)) {
    throw new Error('body.messages is required')
  }
  const { messages } = value
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('body.messages must be a non-empty array')
  }
  return {
    messages,
    threadId: readForwarded(value, (l) =>
      'threadId' in l ? l.threadId : undefined,
    ),
    harness: readForwarded(value, (l) =>
      'harness' in l ? l.harness : undefined,
    ),
    provider: readForwarded(value, (l) =>
      'provider' in l ? l.provider : undefined,
    ),
    grokProtocol: readForwarded(value, (l) =>
      'grokProtocol' in l ? l.grokProtocol : undefined,
    ),
    grokTransport: readForwarded(value, (l) =>
      'grokTransport' in l ? l.grokTransport : undefined,
    ),
  }
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/run')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        let body: RunBody
        try {
          body = parseBody(await request.json())
        } catch (error) {
          return jsonError(
            400,
            error instanceof Error ? error.message : 'invalid body',
          )
        }

        if (!isHarness(body.harness) || !isProvider(body.provider)) {
          return jsonError(400, 'Unknown harness or provider.')
        }
        const harness = body.harness
        const provider = body.provider
        if (
          harness === 'grok' &&
          body.grokProtocol !== undefined &&
          !isGrokProtocol(body.grokProtocol)
        ) {
          return jsonError(400, 'Unknown grokProtocol.')
        }
        if (
          harness === 'grok' &&
          body.grokTransport !== undefined &&
          !isGrokTransport(body.grokTransport)
        ) {
          return jsonError(400, 'Unknown grokTransport.')
        }

        const missing = missingEnv(harness, provider)
        if (missing.length > 0) {
          return jsonError(
            500,
            `Missing required env for ${harness} on ${provider}: ${missing.join(
              ', ',
            )}. Set it and restart the dev server.`,
          )
        }

        const threadId =
          body.threadId !== undefined ? body.threadId : crypto.randomUUID()

        const abortController = new AbortController()
        request.signal.addEventListener('abort', () => abortController.abort())

        try {
          const sandbox = buildSandbox({ harness, provider, threadId })
          const adapter = buildAdapter(
            harness,
            harness === 'grok'
              ? {
                  protocol: isGrokProtocol(body.grokProtocol)
                    ? body.grokProtocol
                    : ('acp' as GrokBuildProtocol),
                  transport: isGrokTransport(body.grokTransport)
                    ? body.grokTransport
                    : ('auto' as GrokTransport),
                }
              : undefined,
          )

          // The one provider-dependent seam: same-machine providers bridge host
          // tools and let the agent mint the preview on demand; hosted providers
          // can't reach us, so we inline the recipe and pre-mint the URL up front.
          let systemPrompts: Array<string>
          let tools: Array<AnyTool>
          if (usesToolBridge(provider)) {
            systemPrompts = [PREVIEW_GUIDANCE]
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
            systemPrompts = [RECIPE_GUIDANCE, previewGuidance(previewUrl)]
            tools = []
          }

          const stream = chat({
            threadId,
            adapter,
            messages: body.messages,
            systemPrompts,
            tools,
            middleware: [withSandbox(sandbox)],
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
  },
})
