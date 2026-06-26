/**
 * /api/mcp-apps-chat — the data plane for the MCP Apps demo.
 *
 * Connects two MCP servers and hands them to `chat({ mcp })`:
 *   - the in-process STATIC weather-card server (same origin), and
 *   - the DYNAMIC Three.js server on :3001 (started by `npm run dev`).
 *
 * When the model calls a UI-linked tool, `@tanstack/ai` reads the linked
 * `ui://` resource and emits a `ui-resource` event, so a `UIResourcePart`
 * lands on the assistant message and the client can render the widget.
 *
 * The Three.js server runs as a separate process, so it may not be up. We
 * connect each server independently and proceed with whichever connected,
 * rather than failing the whole chat when only :3001 is down.
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import type { MCPClient } from '@tanstack/ai-mcp'
import { resolveTextAdapter } from '@/lib/mcp-providers'
import {
  THREEJS_MCP_URL,
  THREEJS_PREFIX,
  WEATHER_PREFIX,
  WEATHER_SERVER_PATH,
} from '@/lib/mcp-apps'

/** Connect one MCP server, returning null (with a warning) if it's unreachable. */
async function tryConnect(
  url: string,
  prefix: string,
): Promise<MCPClient | null> {
  try {
    return await createMCPClient({ transport: { type: 'http', url }, prefix })
  } catch (error) {
    console.warn(
      `[api.mcp-apps-chat] could not connect MCP server "${prefix}" at ${url}:`,
      error instanceof Error ? error.message : error,
    )
    return null
  }
}

export const Route = createFileRoute('/api/mcp-apps-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) return new Response(null, { status: 499 })

        const abortController = new AbortController()

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const origin = new URL(request.url).origin
        const [weather, threejs] = await Promise.all([
          tryConnect(`${origin}${WEATHER_SERVER_PATH}`, WEATHER_PREFIX),
          tryConnect(THREEJS_MCP_URL, THREEJS_PREFIX),
        ])
        const clients = [weather, threejs].filter(
          (c): c is MCPClient => c !== null,
        )

        try {
          // chat() discovers tools from every connected client and closes them
          // when the stream drains (connection: 'close', the default).
          const stream = chat({
            adapter: resolveTextAdapter(params.forwardedProps.provider),
            messages: params.messages,
            mcp: { clients, connection: 'close' },
            agentLoopStrategy: maxIterations(10),
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          // chat() didn't take ownership (it never streamed), so close clients.
          await Promise.allSettled(clients.map((c) => c.close()))
          if (request.signal.aborted || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'An error occurred',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
