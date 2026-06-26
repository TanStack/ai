import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsStream } from '@tanstack/ai'
import { withSandbox } from '@tanstack/ai-sandbox'
import {
  PREVIEW_GUIDANCE,
  adapter,
  makeExposePreviewTool,
  sandbox,
  tanstackStartRecipe,
} from '../sandbox-agent'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'

/**
 * The run route: the browser's `useChat` POSTs `{ messages, data: { threadId } }`
 * and reads back an SSE stream of `StreamChunk`s.
 *
 * Unlike the Cloudflare example — which proxies to a Durable Object over a
 * WebSocket — this runs the agent loop right here: `chat()` with the Claude Code
 * adapter and `withSandbox(...)` middleware. The middleware resumes-or-creates the
 * thread's Docker container; the adapter spawns `claude` inside it, bridges our
 * `tanstackStartRecipe` + `exposePreview` host tools in over MCP, and streams the
 * agent's events back out. `toServerSentEventsStream` re-emits them as SSE.
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
          const stream = chat({
            threadId,
            adapter,
            messages: body.messages,
            // App-agnostic transport guidance prepended to every run: how to bind
            // + expose a dev server so its preview URL works on this provider.
            systemPrompts: [PREVIEW_GUIDANCE],
            // Host tools bridged to the in-sandbox agent over MCP. `exposePreview`
            // closes over this run's threadId so it addresses the right container.
            tools: [
              tanstackStartRecipe,
              makeExposePreviewTool(sandbox, threadId),
            ],
            // Resume-or-create the thread's Docker container and provide the handle
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
