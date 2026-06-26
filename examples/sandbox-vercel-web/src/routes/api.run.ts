import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsStream } from '@tanstack/ai'
import { withSandbox } from '@tanstack/ai-sandbox'
import {
  RECIPE_GUIDANCE,
  adapter,
  previewGuidance,
  resolvePreviewUrl,
  sandbox,
} from '../sandbox-agent'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'

/**
 * The run route: the browser's `useChat` POSTs `{ messages, data: { threadId } }`
 * and reads back an SSE stream of `StreamChunk`s.
 *
 * This runs the agent loop right here: `chat()` with the Claude Code adapter and
 * `withSandbox(...)` middleware. The middleware resumes-or-creates the thread's
 * Vercel Sandbox; the adapter spawns `claude` inside it and streams its events
 * back out. `toServerSentEventsStream` re-emits them as SSE.
 *
 * Unlike the Docker/local example there are NO bridged host tools (`tools: []`):
 * the sandbox is a remote Vercel microVM and can't reach this host. The
 * scaffolding recipe is inlined into the system prompt, and the public preview
 * URL is resolved host-side up front and handed to the agent to share.
 */

interface ProxyBody {
  messages: Array<ModelMessage>
  data?: { threadId?: unknown }
}

function parseBody(value: unknown): ProxyBody {
  if (value === null || typeof value !== 'object' || !('messages' in value)) {
    throw new Error('body.messages is required')
  }
  const { messages } = value
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('body.messages must be a non-empty array')
  }
  let data: { threadId?: unknown } | undefined
  if (
    'data' in value &&
    value.data !== null &&
    typeof value.data === 'object'
  ) {
    data = value.data
  }
  return { messages, data }
}

export const Route = createFileRoute('/api/run')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        if (!process.env.ANTHROPIC_API_KEY) {
          return new Response(
            JSON.stringify({
              error:
                'ANTHROPIC_API_KEY is not set. Export it (the `claude` CLI inside the sandbox needs it) and restart.',
            }),
            { status: 500, headers: { 'content-type': 'application/json' } },
          )
        }

        const hasVercelToken =
          !!process.env.VERCEL_TOKEN || !!process.env.VERCEL_OIDC_TOKEN
        if (
          !hasVercelToken ||
          !process.env.VERCEL_TEAM_ID ||
          !process.env.VERCEL_PROJECT_ID
        ) {
          return new Response(
            JSON.stringify({
              error:
                'Vercel credentials are not set. Export VERCEL_TOKEN (or VERCEL_OIDC_TOKEN), VERCEL_TEAM_ID, and VERCEL_PROJECT_ID, then restart.',
            }),
            { status: 500, headers: { 'content-type': 'application/json' } },
          )
        }

        let body: ProxyBody
        try {
          body = parseBody(await request.json())
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'invalid body'
          return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        }

        const threadId =
          typeof body.data?.threadId === 'string' && body.data.threadId !== ''
            ? body.data.threadId
            : crypto.randomUUID()

        const abortController = new AbortController()
        request.signal.addEventListener('abort', () => abortController.abort())

        try {
          // Pre-mint the public preview URL host-side (the cloud sandbox can't
          // call back to do it). Best-effort: if it fails the agent still runs
          // and is told to surface whatever URL the provider exposes.
          let previewUrl: string | undefined
          try {
            previewUrl = await resolvePreviewUrl(sandbox, threadId)
          } catch (error) {
            console.warn('[api/run] could not pre-resolve preview URL:', error)
          }

          const stream = chat({
            threadId,
            adapter,
            messages: body.messages,
            // Inlined recipe + preview guidance (no host-tool bridge on a hosted
            // provider). The preview URL, if resolved, is baked in for the agent.
            systemPrompts: [RECIPE_GUIDANCE, previewGuidance(previewUrl)],
            // No bridged host tools: the sandbox is remote and can't reach us.
            tools: [],
            // Resume-or-create the thread's Vercel Sandbox and provide the handle
            // the Claude Code adapter requires.
            middleware: [withSandbox(sandbox)],
            abortController,
          }) as AsyncIterable<StreamChunk>

          const sseStream = toServerSentEventsStream(stream, abortController)
          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        } catch (error) {
          if (abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          console.error('[api/run] error:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'run error',
            }),
            { status: 502, headers: { 'content-type': 'application/json' } },
          )
        }
      },
    },
  },
})
